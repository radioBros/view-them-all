import type {
  Block,
  HeadingBlock,
  ListBlock,
  ListItem,
  TableBlock,
  TableRow,
  TableCell,
  ImageBlock,
  Inline,
  TextInline,
  LinkInline,
} from '../../../core/model/types'
import { qs, qsAll, attr } from '../xml'
import { sanitizeHref } from '../../../shared/url'

// ─── Style types ──────────────────────────────────────────────────────────────

type RunStyle = {
  bold?:          boolean
  italic?:        boolean
  underline?:     boolean
  strikethrough?: boolean
  color?:         string
  fontSize?:      number
  fontFamily?:    string
}

type ParaStyle = {
  headingLevel?: 1|2|3|4|5|6
  align?:        'left' | 'center' | 'right' | 'justify'
}

type OdtStyleMaps = {
  textStyles: Map<string, RunStyle>
  paraStyles: Map<string, ParaStyle>
  cellBg:     Map<string, string>   // table cell style name → background color
}

// ─── Style map builders ───────────────────────────────────────────────────────

function buildOdtStyleMaps(...docs: (Document | null | undefined)[]): OdtStyleMaps {
  type RS = RunStyle & { __parent?: string }
  type PS = ParaStyle & { __parent?: string; __outline?: number }
  const textStyles = new Map<string, RS>()
  const paraStyles = new Map<string, PS>()
  const cellBg     = new Map<string, string>()

  for (const doc of docs) {
    if (!doc) continue
    const containers = [qs(doc, 'automatic-styles'), qs(doc, 'styles')]
    for (const container of containers) {
      if (!container) continue
      for (const style of qsAll(container, 'style')) {
        const name   = style.getAttribute('style:name') ?? style.getAttribute('name') ?? ''
        const family = style.getAttribute('style:family') ?? style.getAttribute('family') ?? ''
        if (!name) continue

        const parent   = style.getAttribute('style:parent-style-name') ?? ''
        const textProp = findChild(style, 'text-properties')
        const paraProp = findChild(style, 'paragraph-properties')
        const cellProp = findChild(style, 'table-cell-properties')

        // Text style
        const rs = extractTextProps(textProp)
        if (parent) rs.__parent = parent
        if (!textStyles.has(name)) textStyles.set(name, rs)

        // Paragraph style
        if (family === 'paragraph' || paraProp) {
          const ps: PS = extractParaProps(paraProp)
          // Detect built-in heading style names: Heading_1 / Heading 1 / Heading_20_1
          const hm = name.match(/^Heading[_ ]?(?:20_)?(\d)/i)
          if (hm) ps.__outline = parseInt(hm[1]!, 10) || 1
          if (parent) ps.__parent = parent
          if (!paraStyles.has(name)) paraStyles.set(name, ps)
        }

        // Table cell background
        if (cellProp) {
          const bg = cellProp.getAttribute('fo:background-color') ?? cellProp.getAttribute('background-color') ?? ''
          if (bg && bg !== 'transparent' && bg !== 'auto') {
            cellBg.set(name, bg)
          }
        }
      }
    }
  }

  // Resolve one level of parent inheritance for text styles
  for (const rs of textStyles.values()) {
    if (!rs.__parent) continue
    const p = textStyles.get(rs.__parent)
    if (p) {
      if (p.bold       !== undefined && rs.bold       === undefined) rs.bold       = p.bold
      if (p.italic     !== undefined && rs.italic     === undefined) rs.italic     = p.italic
      if (p.underline  !== undefined && rs.underline  === undefined) rs.underline  = p.underline
      if (p.color      !== undefined && rs.color      === undefined) rs.color      = p.color
      if (p.fontSize   !== undefined && rs.fontSize   === undefined) rs.fontSize   = p.fontSize
      if (p.fontFamily !== undefined && rs.fontFamily === undefined) rs.fontFamily = p.fontFamily
    }
    delete rs.__parent
  }
  for (const ps of paraStyles.values()) {
    if (!ps.__parent) continue
    const p = paraStyles.get(ps.__parent)
    if (p) {
      if (p.headingLevel !== undefined && ps.headingLevel === undefined) ps.headingLevel = p.headingLevel
      if (p.align        !== undefined && ps.align        === undefined) ps.align        = p.align
      // Propagate outline level
      if ((p as any).__outline !== undefined && (ps as any).__outline === undefined) {
        (ps as any).__outline = (p as any).__outline
      }
    }
    delete ps.__parent
  }
  // Convert outline marker to headingLevel
  for (const [, ps] of paraStyles) {
    const outline = (ps as any).__outline
    if (outline) {
      const lvl = typeof outline === 'number' ? outline : parseInt(outline, 10)
      if (!isNaN(lvl) && lvl >= 1 && lvl <= 6) {
        ps.headingLevel = lvl as 1|2|3|4|5|6
      }
      delete (ps as any).__outline
    }
  }

  return { textStyles, paraStyles, cellBg }
}

function extractTextProps(el: Element | null): RunStyle & { __parent?: string } {
  if (!el) return {}
  const rs: RunStyle = {}

  const fw = el.getAttribute('fo:font-weight') ?? el.getAttribute('font-weight')
  if (fw === 'bold') rs.bold = true

  const fi = el.getAttribute('fo:font-style') ?? el.getAttribute('font-style')
  if (fi === 'italic' || fi === 'oblique') rs.italic = true

  const ul = el.getAttribute('style:text-underline-style') ?? el.getAttribute('text-underline-style')
  if (ul && ul !== 'none') rs.underline = true

  const lt = el.getAttribute('style:text-line-through-style') ?? el.getAttribute('text-line-through-style')
  if (lt && lt !== 'none') rs.strikethrough = true

  const color = el.getAttribute('fo:color') ?? el.getAttribute('color')
  if (color && color !== 'auto' && color !== 'transparent') rs.color = color

  const sz = el.getAttribute('fo:font-size') ?? el.getAttribute('font-size')
  if (sz) {
    const pt = parseFontSizePt(sz)
    if (pt !== undefined) rs.fontSize = pt
  }

  const fn = el.getAttribute('style:font-name') ?? el.getAttribute('font-name')
    ?? el.getAttribute('fo:font-family') ?? el.getAttribute('font-family')
  if (fn) rs.fontFamily = fn

  return rs
}

function extractParaProps(el: Element | null): ParaStyle & { __parent?: string } {
  if (!el) return {}
  const ps: ParaStyle = {}

  const align = el.getAttribute('fo:text-align') ?? el.getAttribute('text-align')
  if      (align === 'center')              ps.align = 'center'
  else if (align === 'end'   || align === 'right')   ps.align = 'right'
  else if (align === 'justify')             ps.align = 'justify'
  else if (align === 'start' || align === 'left')    ps.align = 'left'

  return ps
}

function parseFontSizePt(val: string): number | undefined {
  const m = val.match(/^([\d.]+)(pt|px|cm|mm|in)?$/)
  if (!m) return undefined
  const n = parseFloat(m[1]!)
  if (isNaN(n) || n <= 0) return undefined
  switch (m[2]) {
    case 'pt': case undefined: return n
    case 'px': return n * 0.75
    case 'cm': return n * 28.35
    case 'mm': return n * 2.835
    case 'in': return n * 72
    default:   return undefined
  }
}

// ─── Public entry ─────────────────────────────────────────────────────────────

export function parseOdtContent(
  contentXml: Document,
  mediaMap: Map<string, string>,
  stylesXml?: Document | null,
): Block[] {
  const officeText = qs(contentXml, 'text')
  if (!officeText) return []

  const styleMaps = buildOdtStyleMaps(contentXml, stylesXml)
  const blocks: Block[] = []

  for (const child of Array.from(officeText.children)) {
    const local = child.localName

    if (local === 'h') {
      blocks.push(parseHeading(child, styleMaps))
    } else if (local === 'p') {
      const block = parseParagraphOrHeading(child, styleMaps)
      if (block) blocks.push(block)
    } else if (local === 'list') {
      blocks.push(parseList(child, styleMaps))
    } else if (local === 'table') {
      blocks.push(parseTable(child, styleMaps))
    } else if (local === 'frame') {
      const img = parseFrame(child, mediaMap)
      if (img) blocks.push(img)
    } else {
      blocks.push({ type: 'unknown', raw: local })
    }
  }

  return blocks
}

// ─── Inline parsing ───────────────────────────────────────────────────────────

function parseInlines(el: Element, inherited: RunStyle, styleMaps: OdtStyleMaps): Inline[] {
  const result: Inline[] = []

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (!text) continue
      const inline: TextInline = { type: 'text', text }
      if (inherited.bold)          inline.bold          = true
      if (inherited.italic)        inline.italic        = true
      if (inherited.underline)     inline.underline     = true
      if (inherited.strikethrough) inline.strikethrough = true
      if (inherited.color)         inline.color         = inherited.color
      if (inherited.fontSize)      inline.fontSize      = inherited.fontSize
      if (inherited.fontFamily)    inline.fontFamily    = inherited.fontFamily
      result.push(inline)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const child = node as Element
      const local = child.localName

      if (local === 'span') {
        const styleName = attr(child, 'text:style-name', 'style-name') ?? ''
        let spanStyle = styleMaps.textStyles.get(styleName)
        // Fallback: infer from common naming conventions when not in style map
        if (!spanStyle && styleName) {
          spanStyle = {
            bold:          /Bold|Strong/i.test(styleName)       || undefined,
            italic:        /Italic|Oblique|Emphasis/i.test(styleName) || undefined,
            underline:     /Underline/i.test(styleName)         || undefined,
            strikethrough: /Strike|LineThrough/i.test(styleName) || undefined,
          }
        }
        const merged = spanStyle ? mergeRunStyle({ ...inherited }, spanStyle) : inherited
        result.push(...parseInlines(child, merged, styleMaps))
      } else if (local === 'a') {
        const link = parseLink(child)
        if (link) result.push(link)
        else result.push(...parseInlines(child, inherited, styleMaps))
      } else if (local === 'line-break') {
        result.push({ type: 'text', text: '\n' })
      } else if (local === 's') {
        const c = parseInt(child.getAttribute('text:c') ?? child.getAttribute('c') ?? '1', 10)
        result.push({ type: 'text', text: ' '.repeat(isNaN(c) ? 1 : c) })
      } else if (local === 'tab') {
        result.push({ type: 'text', text: '\t' })
      } else {
        result.push(...parseInlines(child, inherited, styleMaps))
      }
    }
  }

  return result
}

function mergeRunStyle(base: RunStyle, override: RunStyle): RunStyle {
  if (override.bold          !== undefined) base.bold          = override.bold
  if (override.italic        !== undefined) base.italic        = override.italic
  if (override.underline     !== undefined) base.underline     = override.underline
  if (override.strikethrough !== undefined) base.strikethrough = override.strikethrough
  if (override.color         !== undefined) base.color         = override.color
  if (override.fontSize      !== undefined) base.fontSize      = override.fontSize
  if (override.fontFamily    !== undefined) base.fontFamily    = override.fontFamily
  return base
}

function parseLink(a: Element): LinkInline | null {
  const rawHref = attr(a, 'xlink:href', 'href') ?? ''
  const href = sanitizeHref(rawHref)
  if (!href) return null
  const text = a.textContent ?? ''
  return { type: 'link', text, href }
}

// ─── Heading ──────────────────────────────────────────────────────────────────

function parseHeading(h: Element, styleMaps: OdtStyleMaps): HeadingBlock {
  const levelStr = attr(h, 'text:outline-level', 'outline-level') ?? '1'
  const rawLevel = parseInt(levelStr, 10)
  const level = (isNaN(rawLevel) || rawLevel < 1 ? 1 : rawLevel > 6 ? 6 : rawLevel) as 1|2|3|4|5|6
  const content = parseInlines(h, {}, styleMaps)
  return { type: 'heading', level, content: content.length ? content : [{ type: 'text', text: '' }] }
}

// ─── Paragraph / heading from style ──────────────────────────────────────────

function parseParagraphOrHeading(p: Element, styleMaps: OdtStyleMaps): Block {
  const styleName = attr(p, 'text:style-name', 'style-name') ?? ''
  const paraStyle = styleMaps.paraStyles.get(styleName)

  // Check for heading level via style map first, then fallback regex on name
  let headingLevel = paraStyle?.headingLevel
  if (!headingLevel) {
    const hm = styleName.match(/Heading[_\s]?(?:20_)?(\d)/i)
    if (hm) {
      const lvl = parseInt(hm[1]!, 10) || 1
      headingLevel = (lvl < 1 ? 1 : lvl > 6 ? 6 : lvl) as 1|2|3|4|5|6
    }
  }

  const content = parseInlines(p, {}, styleMaps)
  if (headingLevel) {
    return { type: 'heading', level: headingLevel, content: content.length ? content : [{ type: 'text', text: '' }] }
  }
  return { type: 'paragraph', content: content.length ? content : [{ type: 'text', text: '' }] }
}

// ─── List ─────────────────────────────────────────────────────────────────────

function parseList(listEl: Element, styleMaps: OdtStyleMaps, depth = 0): ListBlock {
  const styleName = attr(listEl, 'text:style-name', 'style-name') ?? ''
  const ordered = /Numbered|Enumeration|List_20_Number/i.test(styleName)

  const items: ListItem[] = []

  for (const child of Array.from(listEl.children)) {
    if (child.localName !== 'list-item') continue

    const content: Inline[] = []
    let children: ListBlock | undefined

    for (const itemChild of Array.from(child.children)) {
      const childLocal = itemChild.localName
      if (childLocal === 'p' || childLocal === 'h') {
        content.push(...parseInlines(itemChild, {}, styleMaps))
      } else if (childLocal === 'list' && depth < 6) {
        children = parseList(itemChild, styleMaps, depth + 1)
      }
    }

    const item: ListItem = { content: content.length ? content : [{ type: 'text', text: '' }] }
    if (children) item.children = children
    items.push(item)
  }

  return { type: 'list', ordered, items }
}

// ─── Table ────────────────────────────────────────────────────────────────────

function parseTable(tableEl: Element, styleMaps: OdtStyleMaps): TableBlock {
  const rows: TableRow[] = []
  let rowIdx = 0

  for (const child of Array.from(tableEl.children)) {
    if (child.localName !== 'table-row') continue

    const cells: TableCell[] = []

    for (const cellEl of Array.from(child.children)) {
      const cellLocal = cellEl.localName
      if (cellLocal !== 'table-cell' && cellLocal !== 'covered-table-cell') continue
      if (cellLocal === 'covered-table-cell') continue  // skip merge continuations

      const colspanStr   = attr(cellEl, 'table:number-columns-spanned', 'number-columns-spanned')
      const rowspanStr   = attr(cellEl, 'table:number-rows-spanned',    'number-rows-spanned')
      const cellStyleName = attr(cellEl, 'table:style-name', 'style-name') ?? ''

      const colspan = colspanStr ? parseInt(colspanStr, 10) : 1
      const rowspan = rowspanStr ? parseInt(rowspanStr, 10) : 1

      // Collect inline content from text:p children
      const content: Inline[] = []
      for (const pChild of Array.from(cellEl.children)) {
        if (pChild.localName !== 'p') continue
        const inlines = parseInlines(pChild, {}, styleMaps)
        if (content.length > 0 && inlines.length > 0) content.push({ type: 'text', text: ' ' })
        content.push(...inlines)
      }

      // Resolve cell background color from style map
      const backgroundColor = styleMaps.cellBg.get(cellStyleName)

      cells.push({
        content: content.length ? content : [{ type: 'text', text: '' }],
        isHeader: rowIdx === 0 || /Heading/i.test(cellStyleName),
        ...(colspan > 1       ? { colspan }         : {}),
        ...(rowspan > 1       ? { rowspan }         : {}),
        ...(backgroundColor   ? { backgroundColor } : {}),
      })
    }

    if (cells.length > 0) { rows.push({ cells }); rowIdx++ }
  }

  return { type: 'table', rows }
}

// ─── Image / Frame ────────────────────────────────────────────────────────────

function parseFrame(frameEl: Element, mediaMap: Map<string, string>): ImageBlock | null {
  const imgEl = qs(frameEl, 'image')
  if (!imgEl) return null

  const href = attr(imgEl, 'xlink:href', 'href') ?? ''
  const normalizedHref = href.startsWith('./') ? href.slice(2) : href

  const src = mediaMap.get(normalizedHref) ?? mediaMap.get(href)
  if (!src) return null

  const alt = attr(frameEl, 'draw:name', 'name') ?? undefined
  return { type: 'image', src, alt }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function findChild(el: Element, localName: string): Element | null {
  for (const child of Array.from(el.children)) {
    if (child.localName === localName) return child
  }
  return null
}
