import { parseXml, qs, qsAll, wAttr } from '../xml'
import type { TextInline } from '../../../core/model/types'

export type InlineStyle = Partial<Pick<TextInline, 'bold' | 'italic' | 'underline' | 'strikethrough' | 'color' | 'code'>>
export type StyleMap = Map<string, InlineStyle>

export function parseStyles(xmlText: string): StyleMap {
  const map: StyleMap = new Map()
  try {
    const doc = parseXml(xmlText)
    for (const style of qsAll(doc, 'style')) {
      const id  = wAttr(style, 'styleId') ?? ''
      const rPr = qs(style, 'rPr')
      if (id && rPr) map.set(id, extractStyleRunProps(rPr))
    }
  } catch {
    // Non-fatal
  }
  return map
}

function extractStyleRunProps(rPr: Element): InlineStyle {
  const bEl    = qs(rPr, 'b')
  const iEl    = qs(rPr, 'i')
  const uEl    = qs(rPr, 'u')
  const strike = qs(rPr, 'strike')
  const color  = qs(rPr, 'color')
  const rStyle = qs(rPr, 'rStyle')

  const colorVal = wAttr(color, 'val')

  return {
    bold:          bEl ? wAttr(bEl, 'val') !== '0' : undefined,
    italic:        iEl ? wAttr(iEl, 'val') !== '0' : undefined,
    underline:     uEl ? wAttr(uEl, 'val') !== 'none' : undefined,
    strikethrough: !!strike || undefined,
    color:         (!colorVal || colorVal === 'auto') ? undefined : `#${colorVal}`,
    code:          (wAttr(rStyle, 'val') === 'CodeChar') || undefined,
  }
}
