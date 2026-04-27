import type { TextInline, UnknownInline } from '../../../core/model/types'
import type { CellStyle } from './styles'
import { qs } from '../xml'

const EPOCH_1900 = Date.UTC(1899, 11, 31)
const EPOCH_1904 = Date.UTC(1904, 0, 1)

function excelDateToString(serial: number, is1904: boolean): string {
  if (is1904) return new Date(EPOCH_1904 + serial * 86400000).toLocaleDateString()
  const adjusted = serial > 59 ? serial - 1 : serial
  return new Date(EPOCH_1900 + adjusted * 86400000).toLocaleDateString()
}

export function parseCellElement(
  cEl: Element,
  sharedStrings: string[],
  getStyle: (xfIndex: number) => CellStyle,
  is1904: boolean,
): TextInline | UnknownInline {
  const t = cEl.getAttribute('t') ?? ''
  const s = cEl.getAttribute('s')
  const v = qs(cEl, 'v')?.textContent ?? ''

  const xfIdx  = s !== null && s !== undefined ? parseInt(s, 10) : NaN
  const style  = !isNaN(xfIdx) ? getStyle(xfIdx) : null

  let text: string

  if (t === 's') {
    const idx = parseInt(v, 10)
    text = isNaN(idx) ? '' : (sharedStrings[idx] ?? '')
  } else if (t === 'inlineStr') {
    const is = qs(cEl, 'is')
    text = is ? (qs(is, 't')?.textContent ?? '') : ''
  } else if (t === 'b') {
    text = v === '1' ? 'TRUE' : 'FALSE'
  } else if (t === 'e') {
    return { type: 'unknown-inline' as const, raw: v || '#ERR' } as UnknownInline
  } else if (t === 'str') {
    text = v
  } else {
    // Numeric — check style for date
    if (v === '') { text = '' }
    else {
      const num = parseFloat(v)
      if (isNaN(num)) { text = v }
      else if (style?.isDate) { text = excelDateToString(num, is1904) }
      else text = String(num)
    }
  }

  const inline: TextInline = { type: 'text', text }
  if (style) {
    if (style.bold)       inline.bold       = true
    if (style.italic)     inline.italic     = true
    if (style.color)      inline.color      = style.color
    if (style.fontSize)   inline.fontSize   = style.fontSize
    if (style.fontFamily) inline.fontFamily = style.fontFamily
  }
  return inline
}
