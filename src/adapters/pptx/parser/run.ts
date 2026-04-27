import type { Inline, TextInline, SlideParagraph, LinkInline } from '../../../core/model/types'
import { qs, qsAll } from '../xml'
import { REL_NS } from '../xml'
import type { ThemeColors } from './theme'
import { resolveColorEl } from './theme'
import type { RelMap } from './relationships'
import { sanitizeHref } from '../../../shared/url'

/**
 * Parse all paragraphs in a <p:txBody>.
 * Returns one SlideParagraph per non-empty paragraph, preserving alignment,
 * font size, font face, bullet, and theme color resolution.
 *
 * @param txBody   The <p:txBody> or <a:txBody> element
 * @param themeColors  Resolved theme color map (scheme name → hex)
 * @param rels     Slide relationships map for hyperlink resolution
 * @param autoNumCounters  Shared counters for auto-numbered bullets (mutated across paragraphs)
 */
export function parseTxBody(
  txBody: Element,
  themeColors: ThemeColors = new Map(),
  rels: RelMap = new Map(),
  defaultFontSizePt?: number,
  defaultColor?: string,
): SlideParagraph[] {
  const result: SlideParagraph[] = []
  const autoNumCounts = new Map<string, number>()  // type → counter

  for (const para of qsAll(txBody, 'p')) {
    const inlines: Inline[] = []

    const pPr  = qs(para, 'pPr')
    const algn = pPr?.getAttribute('algn') ?? null
    let align: SlideParagraph['align']
    if (algn === 'ctr')  align = 'center'
    else if (algn === 'r')    align = 'right'
    else if (algn === 'just') align = 'justify'

    // Indent level from <a:pPr indent> or <a:pPr lvl>
    const lvl    = pPr ? parseInt(pPr.getAttribute('lvl') ?? '0', 10) || 0 : 0
    const indent = lvl

    // Bullet detection
    let bullet: string | undefined
    if (pPr) {
      const buNone    = qs(pPr, 'buNone')
      const buChar    = qs(pPr, 'buChar')
      const buAutoNum = qs(pPr, 'buAutoNum')

      if (!buNone) {
        if (buChar) {
          bullet = buChar.getAttribute('char') ?? '•'
        } else if (buAutoNum) {
          const numType = buAutoNum.getAttribute('type') ?? 'arabicPeriod'
          const startAt = parseInt(buAutoNum.getAttribute('startAt') ?? '1', 10) || 1
          const prev = autoNumCounts.get(numType) ?? (startAt - 1)
          const cur  = prev + 1
          autoNumCounts.set(numType, cur)
          bullet = formatAutoNum(numType, cur)
        }
      }
    }

    // Default run properties for the paragraph (fallback when run has no explicit props)
    const defRPr = pPr ? qs(pPr, 'defRPr') : null

    for (const run of qsAll(para, 'r')) {
      const tEl  = qs(run, 't')
      const text = tEl?.textContent ?? ''
      if (!text) continue

      const rPr = qs(run, 'rPr')

      // Check for hyperlink rId on rPr
      const hlinkRId = rPr
        ? (rPr.getAttributeNS(REL_NS, 'hlinkClick') ?? rPr.getAttribute('r:hlinkClick') ?? null)
        : null

      if (hlinkRId) {
        const rel = rels.get(hlinkRId)
        if (rel) {
          const safeHref = sanitizeHref(rel.target)
          if (safeHref) {
            inlines.push({ type: 'link', text, href: safeHref } as LinkInline)
            continue
          }
        }
      }

      const inline: TextInline = { type: 'text', text }
      applyRunProps(inline, rPr, themeColors)
      if (defRPr && (!inline.fontSize || !inline.color)) applyRunProps(inline, defRPr, themeColors)
      if (defaultFontSizePt && !inline.fontSize) inline.fontSize = defaultFontSizePt
      if (defaultColor      && !inline.color)    inline.color    = defaultColor
      inlines.push(inline)
    }

    // <a:fld> field elements (slide number, date, etc.)
    for (const fld of qsAll(para, 'fld')) {
      const tEl  = qs(fld, 't')
      const text = tEl?.textContent ?? ''
      if (text) inlines.push({ type: 'text', text })
    }

    if (inlines.length > 0) {
      const paragraph: SlideParagraph = { content: inlines }
      if (align)  paragraph.align  = align
      if (bullet) paragraph.bullet = bullet
      if (indent) paragraph.indent = indent
      result.push(paragraph)
    }
  }

  return result
}

function applyRunProps(
  inline: TextInline,
  rPr: Element | null,
  themeColors: ThemeColors,
): void {
  if (!rPr) return

  const bVal = rPr.getAttribute('b')
  if (bVal === '1' || bVal === 'true') inline.bold = true

  const iVal = rPr.getAttribute('i')
  if (iVal === '1' || iVal === 'true') inline.italic = true

  const uVal = rPr.getAttribute('u')
  if (uVal && uVal !== 'none') inline.underline = true

  const strikeVal = rPr.getAttribute('strike')
  if (strikeVal === 'sngStrike' || strikeVal === 'dblStrike') inline.strikethrough = true

  // sz is in hundredths of a point
  const szVal = rPr.getAttribute('sz')
  if (szVal) {
    const sz = parseInt(szVal, 10)
    if (sz > 0) inline.fontSize = sz / 100
  }

  // Font face: <a:latin typeface="Calibri"/>
  const latin = qs(rPr, 'latin')
  if (latin) {
    const typeface = latin.getAttribute('typeface')
    // Skip theme font references like "+mj-lt", "+mn-lt"
    if (typeface && !typeface.startsWith('+')) {
      inline.fontFamily = typeface
    }
  }

  // Color
  const solidFill = qs(rPr, 'solidFill')
  if (solidFill) {
    const color = resolveColorEl(solidFill, themeColors)
    if (color) inline.color = color
  }
}

function formatAutoNum(type: string, n: number): string {
  switch (type) {
    case 'arabicPeriod':    return `${n}.`
    case 'arabicParenR':    return `${n})`
    case 'romanLcPeriod':   return `${toRoman(n).toLowerCase()}.`
    case 'romanUcPeriod':   return `${toRoman(n)}.`
    case 'alphaLcParenR':   return `${String.fromCharCode(96 + n)})`
    case 'alphaUcParenR':   return `${String.fromCharCode(64 + n)})`
    case 'alphaLcPeriod':   return `${String.fromCharCode(96 + n)}.`
    case 'alphaUcPeriod':   return `${String.fromCharCode(64 + n)}.`
    default:                return `${n}.`
  }
}

function toRoman(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1]
  const syms = ['M','CM','D','CD','C','XC','L','XL','X','IX','V','IV','I']
  let result = ''
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]!) { result += syms[i]; n -= vals[i]! }
  }
  return result
}
