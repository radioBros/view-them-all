import JSZip from 'jszip'
import type { SlideBlock, SlideElement, SlideParagraph, Inline, TextInline, TableRow, TableCell } from '../../../core/model/types'
import { getMimeType } from '../../../shared/mime'
import { sanitizeHref } from '../../../shared/url'
import { qs, qsAll } from '../xml'
import { odfLengthToEmu } from './units'

// Default 4:3 canvas: 25.4cm x 19.05cm in EMU
const DEFAULT_CANVAS_WIDTH  = Math.round(25.4 * 360000)
const DEFAULT_CANVAS_HEIGHT = Math.round(19.05 * 360000)

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
  align?:  'left' | 'center' | 'right' | 'justify'
  indent?: number
}

type StyleMaps = {
  textStyles: Map<string, RunStyle>
  paraStyles: Map<string, ParaStyle>
}

// ─── Style map builders ───────────────────────────────────────────────────────

function buildStyleMaps(...docs: (Document | null | undefined)[]): StyleMaps {
  const textStyles = new Map<string, RunStyle & { __parent?: string }>()
  const paraStyles = new Map<string, ParaStyle & { __parent?: string }>()

  for (const doc of docs) {
    if (!doc) continue
    const containers = [qs(doc, 'automatic-styles'), qs(doc, 'styles')]
    for (const container of containers) {
      if (!container) continue
      for (const style of qsAll(container, 'style')) {
        const name   = style.getAttribute('style:name') ?? style.getAttribute('name') ?? ''
        if (!name) continue
        const parent = style.getAttribute('style:parent-style-name') ?? style.getAttribute('parent-style-name') ?? ''

        const textPropEl  = findDirectChild(style, 'text-properties')
        const paraPropEl  = findDirectChild(style, 'paragraph-properties')

        const rs = parseTextProperties(textPropEl)
        if (parent) rs.__parent = parent
        textStyles.set(name, rs)

        const ps = parseParagraphProperties(paraPropEl)
        if (parent) ps.__parent = parent
        paraStyles.set(name, ps)
      }
    }
  }

  // Resolve one level of parent inheritance
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
      if (p.align  !== undefined && ps.align  === undefined) ps.align  = p.align
      if (p.indent !== undefined && ps.indent === undefined) ps.indent = p.indent
    }
    delete ps.__parent
  }

  return { textStyles, paraStyles }
}

function parseTextProperties(el: Element | null): RunStyle & { __parent?: string } {
  if (!el) return {}
  const rs: RunStyle = {}

  const fw = el.getAttribute('fo:font-weight') ?? el.getAttribute('font-weight')
  if (fw === 'bold') rs.bold = true

  const fs = el.getAttribute('fo:font-style') ?? el.getAttribute('font-style')
  if (fs === 'italic' || fs === 'oblique') rs.italic = true

  const ul = el.getAttribute('style:text-underline-style') ?? el.getAttribute('text-underline-style')
  if (ul && ul !== 'none') rs.underline = true

  const lt = el.getAttribute('style:text-line-through-style') ?? el.getAttribute('text-line-through-style')
  if (lt && lt !== 'none') rs.strikethrough = true

  const color = el.getAttribute('fo:color') ?? el.getAttribute('color')
  if (color && color !== 'auto' && color !== 'transparent') rs.color = color

  const sizeVal = el.getAttribute('fo:font-size') ?? el.getAttribute('font-size')
  if (sizeVal) {
    const pt = parseFontSizePt(sizeVal)
    if (pt !== undefined) rs.fontSize = pt
  }

  const fontName = el.getAttribute('style:font-name') ?? el.getAttribute('font-name')
    ?? el.getAttribute('fo:font-family') ?? el.getAttribute('font-family')
  if (fontName) rs.fontFamily = fontName

  return rs
}

function parseParagraphProperties(el: Element | null): ParaStyle & { __parent?: string } {
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

// ─── Page background maps ─────────────────────────────────────────────────────

function buildPageStyleBgMap(doc: Document): Map<string, string> {
  const map = new Map<string, string>()
  const containers = [qs(doc, 'automatic-styles'), qs(doc, 'styles')]
  for (const container of containers) {
    if (!container) continue
    for (const style of qsAll(container, 'style')) {
      const name = style.getAttribute('style:name') ?? style.getAttribute('name') ?? ''
      if (!name) continue
      for (const child of Array.from(style.children)) {
        if (child.localName === 'drawing-page-properties') {
          const fill  = child.getAttribute('draw:fill') ?? child.getAttribute('fill') ?? ''
          const color = child.getAttribute('draw:fill-color') ?? child.getAttribute('fill-color') ?? ''
          if ((fill === 'solid' || fill === '') && color) {
            map.set(name, color)
          }
        }
      }
    }
  }
  return map
}

function buildMasterPageBgMap(stylesDoc: Document): Map<string, string> {
  const styleColorMap = buildPageStyleBgMap(stylesDoc)
  const map = new Map<string, string>()
  for (const masterPage of qsAll(stylesDoc, 'master-page')) {
    const masterName = masterPage.getAttribute('style:name') ?? masterPage.getAttribute('name') ?? ''
    if (!masterName) continue
    const styleName = masterPage.getAttribute('draw:style-name') ?? masterPage.getAttribute('style-name') ?? ''
    if (styleName) {
      const color = styleColorMap.get(styleName)
      if (color) { map.set(masterName, color); continue }
    }
    for (const child of Array.from(masterPage.children)) {
      if (child.localName === 'drawing-page-properties') {
        const fill  = child.getAttribute('draw:fill') ?? child.getAttribute('fill') ?? ''
        const color = child.getAttribute('draw:fill-color') ?? child.getAttribute('fill-color') ?? ''
        if ((fill === 'solid' || fill === '') && color) {
          map.set(masterName, color)
        }
      }
    }
  }
  return map
}

// ─── Main slide parser ────────────────────────────────────────────────────────

export async function parseOdpSlides(
  contentXml: Document,
  zip: JSZip,
  options?: { signal?: AbortSignal },
  stylesXml?: Document | null,
): Promise<SlideBlock[]> {
  // Canvas size from page-layout-properties
  let canvasWidth  = DEFAULT_CANVAS_WIDTH
  let canvasHeight = DEFAULT_CANVAS_HEIGHT
  for (const props of qsAll(contentXml, 'page-layout-properties')) {
    const w = getAnyAttr(props, 'page-width')
    const h = getAnyAttr(props, 'page-height')
    if (w && h) {
      const wEmu = odfLengthToEmu(w)
      const hEmu = odfLengthToEmu(h)
      if (wEmu > 0 && hEmu > 0) { canvasWidth = wEmu; canvasHeight = hEmu; break }
    }
  }

  // Build style lookup maps from both content.xml and styles.xml
  const styleMaps     = buildStyleMaps(contentXml, stylesXml)
  const pageStyleBgMap = buildPageStyleBgMap(contentXml)
  const masterBgMap    = stylesXml ? buildMasterPageBgMap(stylesXml) : new Map<string, string>()

  const pages  = qsAll(contentXml, 'page')
  const slides: SlideBlock[] = []

  for (let index = 0; index < pages.length; index++) {
    if (options?.signal?.aborted) break

    const page     = pages[index]!
    const elements: SlideElement[] = []

    for (const child of Array.from(page.children)) {
      const ln = child.localName

      if (ln === 'frame') {
        const el = await parseFrame(child, zip, styleMaps)
        if (el) elements.push(el)

      } else if (ln === 'custom-shape' || ln === 'rect' || ln === 'ellipse' || ln === 'connector') {
        // Presentation shapes: may contain text directly or via text-box child
        const el = parseShapeWithText(child, styleMaps)
        if (el) elements.push(el)

      } else if (ln === 'g') {
        // draw:g — group: recurse and collect children
        const groupEls = await parseGroup(child, zip, styleMaps)
        elements.push(...groupEls)
      }
    }

    // Speaker notes
    let notes: string | undefined
    const notesEl = findDirectChild(page, 'notes')
    if (notesEl) {
      const noteTexts = qsAll(notesEl, 'p').map(p => p.textContent ?? '').filter(t => t.trim())
      if (noteTexts.length > 0) notes = noteTexts.join('\n')
    }

    // Background
    const pageStyleName  = page.getAttribute('draw:style-name') ?? page.getAttribute('style-name') ?? ''
    const masterPageName = page.getAttribute('draw:master-page-name') ?? page.getAttribute('master-page-name') ?? ''
    const background     = pageStyleBgMap.get(pageStyleName) ?? masterBgMap.get(masterPageName) ?? undefined

    slides.push({
      type: 'slide',
      index,
      canvasWidth,
      canvasHeight,
      elements,
      ...(background ? { background } : {}),
      ...(notes      ? { notes }      : {}),
    })
  }

  return slides
}

// ─── Frame parser (draw:frame) ────────────────────────────────────────────────

async function parseFrame(
  frame: Element,
  zip: JSZip,
  styleMaps: StyleMaps,
): Promise<SlideElement | null> {
  const x      = odfLengthToEmu(getAnyAttr(frame, 'x'))
  const y      = odfLengthToEmu(getAnyAttr(frame, 'y'))
  const width  = odfLengthToEmu(getAnyAttr(frame, 'width'))
  const height = odfLengthToEmu(getAnyAttr(frame, 'height'))

  for (const child of Array.from(frame.children)) {
    const fcLocal = child.localName

    if (fcLocal === 'text-box') {
      const paragraphs = parseTextBoxParagraphs(child, styleMaps)
      if (paragraphs.length > 0) return { type: 'text', x, y, width, height, paragraphs }
      return null
    }

    if (fcLocal === 'image') {
      const href = child.getAttribute('xlink:href') ?? child.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? null
      if (href) {
        const src = await resolveImageSrc(href, zip)
        if (src) return { type: 'image', x, y, width, height, src }
      }
      return null
    }

    if (fcLocal === 'table') {
      const el = parseOdfTable(child, x, y, width, height, styleMaps)
      if (el) return el
      return null
    }
  }

  return null
}

// ─── Custom shape / rect / ellipse parser ────────────────────────────────────

function parseShapeWithText(shape: Element, styleMaps: StyleMaps): SlideElement | null {
  const x      = odfLengthToEmu(getAnyAttr(shape, 'x'))
  const y      = odfLengthToEmu(getAnyAttr(shape, 'y'))
  const width  = odfLengthToEmu(getAnyAttr(shape, 'width'))
  const height = odfLengthToEmu(getAnyAttr(shape, 'height'))

  // Check for text-box child first
  const textBox = findDirectChild(shape, 'text-box')
  if (textBox) {
    const paragraphs = parseTextBoxParagraphs(textBox, styleMaps)
    if (paragraphs.length > 0) return { type: 'text', x, y, width, height, paragraphs }
    return null
  }

  // Collect text:p elements directly inside the shape
  const paragraphs = parseTextBoxParagraphs(shape, styleMaps)
  if (paragraphs.length > 0) return { type: 'text', x, y, width, height, paragraphs }

  return null
}

// ─── Group parser (draw:g) ────────────────────────────────────────────────────

async function parseGroup(g: Element, zip: JSZip, styleMaps: StyleMaps): Promise<SlideElement[]> {
  const elements: SlideElement[] = []
  for (const child of Array.from(g.children)) {
    const ln = child.localName
    if (ln === 'frame') {
      const el = await parseFrame(child, zip, styleMaps)
      if (el) elements.push(el)
    } else if (ln === 'custom-shape' || ln === 'rect' || ln === 'ellipse') {
      const el = parseShapeWithText(child, styleMaps)
      if (el) elements.push(el)
    } else if (ln === 'g') {
      elements.push(...await parseGroup(child, zip, styleMaps))
    }
  }
  return elements
}

// ─── ODF table parser ─────────────────────────────────────────────────────────

function parseOdfTable(
  tbl: Element,
  x: number, y: number, width: number, height: number,
  styleMaps: StyleMaps,
): SlideElement | null {
  const rows: TableRow[] = []

  let rowIdx = 0
  for (const trEl of Array.from(tbl.children)) {
    if (trEl.localName !== 'table-row') continue
    const cells: TableCell[] = []

    for (const tcEl of Array.from(trEl.children)) {
      if (tcEl.localName !== 'table-cell' && tcEl.localName !== 'covered-table-cell') continue
      if (tcEl.localName === 'covered-table-cell') continue  // skip merged continuations

      const colspan = parseInt(tcEl.getAttribute('table:number-columns-spanned') ?? '1', 10) || 1
      const rowspan = parseInt(tcEl.getAttribute('table:number-rows-spanned')    ?? '1', 10) || 1

      // Cell background color
      let backgroundColor: string | undefined
      const cellStyleName = tcEl.getAttribute('table:style-name') ?? tcEl.getAttribute('style-name') ?? ''
      if (cellStyleName) {
        backgroundColor = resolveCellBackground(cellStyleName, tbl.ownerDocument)
      }

      // Cell content — paragraphs → inlines
      const content: Inline[] = []
      const parasInCell = Array.from(tcEl.getElementsByTagNameNS('*', 'p'))
      for (let i = 0; i < parasInCell.length; i++) {
        const paraInlines = parseParagraphInlines(parasInCell[i]!, {}, styleMaps)
        content.push(...paraInlines)
        if (i < parasInCell.length - 1) content.push({ type: 'text', text: '\n' })
      }

      const cell: TableCell = { content, isHeader: rowIdx === 0 }
      if (colspan > 1)     cell.colspan         = colspan
      if (rowspan > 1)     cell.rowspan         = rowspan
      if (backgroundColor) cell.backgroundColor = backgroundColor
      cells.push(cell)
    }

    if (cells.length > 0) { rows.push({ cells }); rowIdx++ }
  }

  if (rows.length === 0) return null
  return { type: 'table', x, y, width, height, rows }
}

function resolveCellBackground(styleName: string, doc: Document | null): string | undefined {
  if (!doc) return undefined
  const containers = [qs(doc, 'automatic-styles'), qs(doc, 'styles')]
  for (const container of containers) {
    if (!container) continue
    for (const style of qsAll(container, 'style')) {
      const name = style.getAttribute('style:name') ?? style.getAttribute('name') ?? ''
      if (name !== styleName) continue
      const tableProps = findDirectChild(style, 'table-cell-properties')
      if (tableProps) {
        const bg = tableProps.getAttribute('fo:background-color') ?? tableProps.getAttribute('background-color')
        if (bg && bg !== 'transparent' && bg !== 'auto') return bg
      }
    }
  }
  return undefined
}

// ─── Text box paragraph parser ────────────────────────────────────────────────

function parseTextBoxParagraphs(textBox: Element, styleMaps: StyleMaps): SlideParagraph[] {
  const result: SlideParagraph[] = []
  for (const para of Array.from(textBox.getElementsByTagNameNS('*', 'p'))) {
    const styleName = para.getAttribute('text:style-name') ?? para.getAttribute('style-name') ?? ''
    const paraStyle = styleMaps.paraStyles.get(styleName)

    const content = parseParagraphInlines(para, {}, styleMaps)
    if (content.length === 0) continue

    const paragraph: SlideParagraph = { content }
    if (paraStyle?.align) paragraph.align = paraStyle.align
    result.push(paragraph)
  }
  return result
}

function parseParagraphInlines(para: Element, inherited: RunStyle, styleMaps: StyleMaps): Inline[] {
  // Inherit paragraph-level text style
  const styleName = para.getAttribute('text:style-name') ?? para.getAttribute('style-name') ?? ''
  const paraTextStyle = styleMaps.textStyles.get(styleName)
  const base: RunStyle = paraTextStyle ? mergeStyle({}, paraTextStyle) : {}
  const merged = mergeStyle(base, inherited)

  const inlines: Inline[] = []
  walkInlineNodes(para, inlines, merged, styleMaps)
  return inlines
}

// ─── Inline walker ────────────────────────────────────────────────────────────

function walkInlineNodes(node: Node, inlines: Inline[], inherited: RunStyle, styleMaps: StyleMaps): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (!text) continue
      const inline: TextInline = { type: 'text', text }
      if (inherited.bold)          inline.bold          = true
      if (inherited.italic)        inline.italic        = true
      if (inherited.underline)     inline.underline     = true
      if (inherited.strikethrough) inline.strikethrough = true
      if (inherited.color)         inline.color         = inherited.color
      if (inherited.fontSize)      inline.fontSize      = inherited.fontSize
      if (inherited.fontFamily)    inline.fontFamily    = inherited.fontFamily
      inlines.push(inline)

    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el        = child as Element
      const localName = el.localName

      if (localName === 'span') {
        const styleName  = el.getAttribute('text:style-name') ?? el.getAttribute('style-name') ?? ''
        const spanStyle  = styleMaps.textStyles.get(styleName)
        const merged     = spanStyle ? mergeStyle({ ...inherited }, spanStyle) : inherited
        walkInlineNodes(el, inlines, merged, styleMaps)

      } else if (localName === 'a') {
        const href = el.getAttribute('xlink:href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
        const text = el.textContent ?? ''
        if (href && text) {
          const safeHref = sanitizeHref(href)
          if (safeHref) { inlines.push({ type: 'link', text, href: safeHref }); continue }
        }
        if (text) inlines.push({ type: 'text', text })

      } else if (localName === 's') {
        const c = parseInt(el.getAttribute('text:c') ?? el.getAttribute('c') ?? '1', 10)
        inlines.push({ type: 'text', text: ' '.repeat(isNaN(c) ? 1 : c) })

      } else if (localName === 'line-break') {
        inlines.push({ type: 'text', text: '\n' })

      } else if (localName === 'tab') {
        inlines.push({ type: 'text', text: '\t' })

      } else if (localName !== 'notes' && localName !== 'note') {
        // Recurse (handles list-item, etc.); skip note elements to avoid speaker note text leaking
        walkInlineNodes(el, inlines, inherited, styleMaps)
      }
    }
  }
}

// ─── Style merge helper ───────────────────────────────────────────────────────

function mergeStyle(base: RunStyle, override: RunStyle): RunStyle {
  const result = { ...base }
  if (override.bold          !== undefined) result.bold          = override.bold
  if (override.italic        !== undefined) result.italic        = override.italic
  if (override.underline     !== undefined) result.underline     = override.underline
  if (override.strikethrough !== undefined) result.strikethrough = override.strikethrough
  if (override.color         !== undefined) result.color         = override.color
  if (override.fontSize      !== undefined) result.fontSize      = override.fontSize
  if (override.fontFamily    !== undefined) result.fontFamily    = override.fontFamily
  return result
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function findDirectChild(el: Element, localName: string): Element | null {
  for (const child of Array.from(el.children)) {
    if (child.localName === localName) return child
  }
  return null
}

function getAnyAttr(el: Element, name: string): string | null {
  return (
    el.getAttribute(`svg:${name}`) ??
    el.getAttribute(`fo:${name}`) ??
    el.getAttribute(name) ??
    null
  )
}

async function resolveImageSrc(href: string, zip: JSZip): Promise<string | null> {
  const path = href.replace(/^\.\//, '')
  try {
    const entry = zip.file(path)
    if (!entry) return null
    const data = await entry.async('arraybuffer')
    const mime = getMimeType(path)
    const blob = new Blob([data], { type: mime })
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}
