import type {
  Block, Inline, ParagraphBlock, HeadingBlock,
  ListBlock, ListItem, TableBlock, TableRow, TableCell,
  ImageBlock, CodeBlock, HrBlock, ImageInline,
} from '../../../core/model/types'
import { sanitizeHref } from '../../../shared/url'

// ─── Public API ───────────────────────────────────────────────────────────────

export function parseHtmlChapter(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body
  if (!body) return []
  return parseBlockChildren(Array.from(body.childNodes))
}

/**
 * Replace relative image srcs with blob URLs from mediaMap.
 * Works on all blocks recursively, including inline images.
 */
export function resolveImageSrcs(
  blocks: Block[],
  baseDir: string,
  mediaMap: Map<string, string>,
): Block[] {
  return blocks.map(b => resolveBlock(b, baseDir, mediaMap))
}

// ─── Block parsing ────────────────────────────────────────────────────────────

function parseBlockChildren(nodes: ChildNode[]): Block[] {
  const blocks: Block[] = []

  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim() ?? ''
      if (text) {
        blocks.push({ type: 'paragraph', content: [{ type: 'text', text }] })
      }
      continue
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const el = node as Element
    const tag = el.tagName.toLowerCase()

    switch (tag) {
      case 'h1': case 'h2': case 'h3':
      case 'h4': case 'h5': case 'h6': {
        const level = parseInt(tag[1]!, 10) as 1|2|3|4|5|6
        blocks.push({ type: 'heading', level, content: parseInlines(el) })
        break
      }

      case 'p': {
        const content = parseInlines(el)
        if (content.length > 0) {
          blocks.push({ type: 'paragraph', content })
        }
        break
      }

      case 'ul':
        blocks.push(parseList(el, false))
        break

      case 'ol':
        blocks.push(parseList(el, true))
        break

      case 'table':
        blocks.push(parseTable(el))
        break

      case 'pre': {
        const codeEl = el.querySelector('code')
        const code   = (codeEl ?? el).textContent ?? ''
        const lang   = extractCodeLanguage(codeEl ?? el)
        blocks.push({ type: 'code', code, ...(lang ? { language: lang } : {}) })
        break
      }

      case 'hr':
        blocks.push({ type: 'hr' })
        break

      case 'img': {
        const src = el.getAttribute('src') ?? ''
        const alt = el.getAttribute('alt') ?? undefined
        if (src) blocks.push({ type: 'image', src, alt })
        break
      }

      case 'blockquote': {
        // Wrap blockquote content in a paragraph
        const content = parseInlines(el)
        if (content.length > 0) {
          blocks.push({ type: 'paragraph', content })
        } else {
          // Recurse into block children
          blocks.push(...parseBlockChildren(Array.from(el.childNodes)))
        }
        break
      }

      case 'div': case 'section': case 'article':
      case 'main': case 'header': case 'footer':
      case 'aside': case 'nav': case 'figure':
        // Recurse into generic container elements
        blocks.push(...parseBlockChildren(Array.from(el.childNodes)))
        break

      case 'figcaption': {
        const content = parseInlines(el)
        if (content.length > 0) blocks.push({ type: 'paragraph', content })
        break
      }

      default:
        // Ignore: script, style, head, link, meta, etc.
        break
    }
  }

  return blocks
}

// ─── List parsing ─────────────────────────────────────────────────────────────

function parseList(el: Element, ordered: boolean): ListBlock {
  const items: ListItem[] = []

  for (const child of Array.from(el.children)) {
    if (child.tagName.toLowerCase() !== 'li') continue
    items.push(parseListItem(child, ordered))
  }

  return { type: 'list', ordered, items }
}

function parseListItem(el: Element, parentOrdered: boolean): ListItem {
  const content: Inline[] = []
  let children: ListBlock | undefined

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const tag = (child as Element).tagName.toLowerCase()
      if (tag === 'ul') {
        children = parseList(child as Element, false)
        continue
      }
      if (tag === 'ol') {
        children = parseList(child as Element, true)
        continue
      }
    }
    // Collect inline content from all other nodes
    content.push(...parseInlineNode(child))
  }

  const item: ListItem = { content: content.length > 0 ? content : [{ type: 'text', text: '' }] }
  if (children) item.children = children
  return item
}

// ─── Table parsing ────────────────────────────────────────────────────────────

function parseTable(el: Element): TableBlock {
  const rows: TableRow[] = []

  // thead, tbody, tfoot, or direct tr
  for (const section of Array.from(el.children)) {
    const sTag = section.tagName.toLowerCase()
    const isHeadSection = sTag === 'thead'

    if (sTag === 'tr') {
      rows.push(parseTableRow(section, false))
    } else if (sTag === 'thead' || sTag === 'tbody' || sTag === 'tfoot') {
      for (const tr of Array.from(section.children)) {
        if (tr.tagName.toLowerCase() === 'tr') {
          rows.push(parseTableRow(tr, isHeadSection))
        }
      }
    }
  }

  return { type: 'table', rows }
}

function parseTableRow(tr: Element, headSection: boolean): TableRow {
  const cells: TableCell[] = []

  for (const cell of Array.from(tr.children)) {
    const tag      = cell.tagName.toLowerCase()
    const isHeader = headSection || tag === 'th'

    if (tag !== 'td' && tag !== 'th') continue

    const content  = parseInlines(cell)
    const colspan  = parseInt(cell.getAttribute('colspan') ?? '1', 10)
    const rowspan  = parseInt(cell.getAttribute('rowspan') ?? '1', 10)

    const tc: TableCell = { content, isHeader }
    if (colspan > 1) tc.colspan = colspan
    if (rowspan > 1) tc.rowspan = rowspan
    cells.push(tc)
  }

  return { cells }
}

// ─── Inline parsing ───────────────────────────────────────────────────────────

function parseInlines(el: Element): Inline[] {
  const result: Inline[] = []
  for (const child of Array.from(el.childNodes)) {
    result.push(...parseInlineNode(child))
  }
  return result
}

function parseInlineNode(node: ChildNode, bold = false, italic = false, underline = false, strikethrough = false): Inline[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? ''
    if (!text) return []
    const inline: Record<string, unknown> = { type: 'text', text }
    if (bold)          inline.bold          = true
    if (italic)        inline.italic        = true
    if (underline)     inline.underline     = true
    if (strikethrough) inline.strikethrough = true
    return [inline as Inline]
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return []
  const el  = node as Element
  const tag = el.tagName.toLowerCase()

  switch (tag) {
    case 'strong': case 'b':
      return flatMap(el.childNodes, c => parseInlineNode(c, true,   italic,      underline, strikethrough))

    case 'em': case 'i':
      return flatMap(el.childNodes, c => parseInlineNode(c, bold,   true,        underline, strikethrough))

    case 'u':
      return flatMap(el.childNodes, c => parseInlineNode(c, bold,   italic,      true,      strikethrough))

    case 's': case 'del': case 'strike':
      return flatMap(el.childNodes, c => parseInlineNode(c, bold,   italic,      underline, true))

    case 'code': {
      const text = el.textContent ?? ''
      if (!text) return []
      const inline: Record<string, unknown> = { type: 'text', text, code: true }
      if (bold)          inline.bold          = true
      if (italic)        inline.italic        = true
      if (strikethrough) inline.strikethrough = true
      return [inline as Inline]
    }

    case 'a': {
      const href = el.getAttribute('href') ?? ''
      const text = el.textContent ?? ''
      if (!text) return []
      if (href) {
        const safe = sanitizeHref(href)
        if (safe) return [{ type: 'link', text, href: safe }]
      }
      // Unsafe href: emit as plain text
      return [{ type: 'text', text }]
    }

    case 'img': {
      const src = el.getAttribute('src') ?? ''
      const alt = el.getAttribute('alt') ?? undefined
      if (!src) return []
      const inline: ImageInline = { type: 'image-inline', src }
      if (alt) inline.alt = alt
      return [inline]
    }

    case 'span':
      return flatMap(el.childNodes, c => parseInlineNode(c, bold, italic, underline, strikethrough))

    case 'br':
      return [{ type: 'text', text: '\n' }]

    case 'sup': case 'sub':
      return flatMap(el.childNodes, c => parseInlineNode(c, bold, italic, underline, strikethrough))

    default:
      // Recurse for unknown inline elements
      return flatMap(el.childNodes, c => parseInlineNode(c, bold, italic, underline, strikethrough))
  }
}

function flatMap<T>(nodes: NodeListOf<ChildNode>, fn: (n: ChildNode) => T[]): T[] {
  const result: T[] = []
  for (const n of Array.from(nodes)) result.push(...fn(n))
  return result
}

function extractCodeLanguage(el: Element): string | undefined {
  const cls = el.getAttribute('class') ?? ''
  const match = cls.match(/(?:language|lang)-(\S+)/)
  return match?.[1] ?? undefined
}

// ─── Image resolution ─────────────────────────────────────────────────────────

function resolveBlock(block: Block, baseDir: string, mediaMap: Map<string, string>): Block {
  if (block.type === 'image') {
    const resolved = resolveImageUrl(block.src, baseDir, mediaMap)
    return resolved !== block.src ? { ...block, src: resolved } : block
  }

  if (block.type === 'paragraph' || block.type === 'heading') {
    const content = block.content.map(i => resolveInline(i, baseDir, mediaMap))
    return { ...block, content }
  }

  if (block.type === 'list') {
    return {
      ...block,
      items: block.items.map(item => resolveListItem(item, baseDir, mediaMap)),
    }
  }

  if (block.type === 'table') {
    return {
      ...block,
      rows: block.rows.map(row => ({
        cells: row.cells.map(cell => ({
          ...cell,
          content: cell.content.map(i => resolveInline(i, baseDir, mediaMap)),
        })),
      })),
    }
  }

  return block
}

function resolveListItem(item: ListItem, baseDir: string, mediaMap: Map<string, string>): ListItem {
  const result: ListItem = {
    content: item.content.map(i => resolveInline(i, baseDir, mediaMap)),
  }
  if (item.children) {
    result.children = {
      ...item.children,
      items: item.children.items.map(i => resolveListItem(i, baseDir, mediaMap)),
    }
  }
  return result
}

function resolveInline(inline: Inline, baseDir: string, mediaMap: Map<string, string>): Inline {
  if (inline.type === 'image-inline') {
    const resolved = resolveImageUrl(inline.src, baseDir, mediaMap)
    return resolved !== inline.src ? { ...inline, src: resolved } : inline
  }
  return inline
}

function resolveImageUrl(src: string, baseDir: string, mediaMap: Map<string, string>): string {
  if (src.startsWith('blob:') || src.startsWith('data:') || src.startsWith('http:') || src.startsWith('https:')) {
    return src
  }

  // Resolve relative path against baseDir
  const resolved = normalizePath(baseDir ? `${baseDir}/${src}` : src)

  const blobUrl = mediaMap.get(resolved)
  if (blobUrl) return blobUrl

  // Also try without leading slash
  const noSlash = resolved.startsWith('/') ? resolved.slice(1) : resolved
  return mediaMap.get(noSlash) ?? src
}

/**
 * Normalize a path by resolving .. and . segments (no URL API needed).
 */
function normalizePath(path: string): string {
  const parts = path.split('/')
  const stack: string[] = []

  for (const part of parts) {
    if (part === '..') {
      stack.pop()
    } else if (part !== '.' && part !== '') {
      stack.push(part)
    }
  }

  return stack.join('/')
}
