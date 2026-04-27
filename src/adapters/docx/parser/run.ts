import type { Inline, TextInline } from '../../../core/model/types'
import type { StyleMap } from './styles'
import type { RelMap } from './relationships'
import { sanitizeHref } from '../../../shared/url'
import { qs, qsAll, wAttr } from '../xml'

export type RunContext = {
  styles: StyleMap
  rels:   RelMap
}

export function parseRun(r: Element, ctx: RunContext, hyperlinkRId?: string): Inline[] {
  const rPr  = qs(r, 'rPr')
  const style = extractRunStyle(rPr)

  const texts = qsAll(r, 't').map(t => t.textContent ?? '')
  const text  = texts.join('')
  if (!text) return []

  if (hyperlinkRId && ctx.rels.has(hyperlinkRId)) {
    const target = ctx.rels.get(hyperlinkRId)!.target
    const href   = sanitizeHref(target)
    if (href) return [{ type: 'link', text, href }]
  }

  const inline: TextInline = { type: 'text', text }
  if (style.bold)          inline.bold          = true
  if (style.italic)        inline.italic        = true
  if (style.underline)     inline.underline     = true
  if (style.strikethrough) inline.strikethrough = true
  if (style.color)         inline.color         = style.color
  if (style.code)          inline.code          = true
  if (style.fontSize)      inline.fontSize      = style.fontSize
  if (style.fontFamily)    inline.fontFamily    = style.fontFamily

  return [inline]
}

export function extractRunStyle(rPr: Element | null): {
  bold?: boolean; italic?: boolean; underline?: boolean
  strikethrough?: boolean; color?: string; code?: boolean
  fontSize?: number; fontFamily?: string
} {
  if (!rPr) return {}

  const bEl    = qs(rPr, 'b')
  const iEl    = qs(rPr, 'i')
  const uEl    = qs(rPr, 'u')
  const strike = qs(rPr, 'strike')
  const color  = qs(rPr, 'color')
  const rStyle = qs(rPr, 'rStyle')
  const szEl   = qs(rPr, 'sz')
  const fontsEl = qs(rPr, 'rFonts')

  // sz is in half-points; divide by 2 to get pt
  const szVal = szEl ? parseInt(wAttr(szEl, 'val') ?? '0', 10) : 0
  // rFonts: prefer ascii, then hAnsi, then eastAsia
  const fontName = fontsEl
    ? (wAttr(fontsEl, 'ascii') ?? wAttr(fontsEl, 'hAnsi') ?? wAttr(fontsEl, 'eastAsia') ?? undefined)
    : undefined

  return {
    bold:          bEl    ? wAttr(bEl,    'val') !== '0'    : undefined,
    italic:        iEl    ? wAttr(iEl,    'val') !== '0'    : undefined,
    underline:     uEl    ? wAttr(uEl,    'val') !== 'none' : undefined,
    strikethrough: !!strike || undefined,
    color:         parseColor(wAttr(color, 'val')),
    code:          (wAttr(rStyle, 'val') === 'CodeChar') || undefined,
    fontSize:      szVal > 0 ? szVal / 2 : undefined,
    fontFamily:    fontName,
  }
}

function parseColor(val: string | null | undefined): string | undefined {
  if (!val || val === 'auto') return undefined
  return `#${val}`
}
