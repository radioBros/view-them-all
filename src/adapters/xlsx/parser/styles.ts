import { parseXml, qsAll, qs, attr } from '../xml'

// OOXML built-in date/time numFmtIds
const BUILTIN_DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function isDateFormat(formatCode: string): boolean {
  let s = formatCode.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '')
  s = s.toLowerCase()
  if (/^[#0,. %e+\-_*\\@]+$/.test(s)) return false
  return /[yd]/.test(s) || (/m/.test(s) && !/^[#0,. %e+\-]+$/.test(s))
}

export type CellStyle = {
  isDate: boolean
  bold?: boolean
  italic?: boolean
  fontSize?: number
  fontFamily?: string
  color?: string
  backgroundColor?: string
}

type FontInfo = {
  bold?: boolean
  italic?: boolean
  fontSize?: number
  fontFamily?: string
  color?: string
}

type FillInfo = { backgroundColor?: string }

function parseArgbColor(argb: string | null | undefined): string | undefined {
  if (!argb || argb.length < 6) return undefined
  // ARGB: "FFRRGGBB" — skip the alpha byte
  const hex = argb.length === 8 ? argb.slice(2) : argb
  return `#${hex}`
}

export function parseStyles(xmlText: string): (xfIndex: number) => CellStyle {
  const doc = parseXml(xmlText)

  // numFmt map for date detection
  const numFmtMap = new Map<number, string>()
  for (const fmt of qsAll(doc, 'numFmt')) {
    const id   = parseInt(attr(fmt, 'numFmtId') ?? '-1', 10)
    const code = attr(fmt, 'formatCode') ?? ''
    if (!isNaN(id)) numFmtMap.set(id, code)
  }

  // Parse fonts
  const fontsEl = qs(doc, 'fonts')
  const fontEls = fontsEl ? qsAll(fontsEl, 'font') : []
  const fonts: FontInfo[] = fontEls.map(f => {
    const bEl    = qs(f, 'b')
    const iEl    = qs(f, 'i')
    const szEl   = qs(f, 'sz')
    const nameEl = qs(f, 'name')
    const colorEl = qs(f, 'color')

    const szVal   = szEl   ? parseFloat(attr(szEl,   'val') ?? '0') : undefined
    const nameVal = nameEl ? attr(nameEl, 'val') ?? undefined : undefined
    const colorRgb = colorEl ? parseArgbColor(attr(colorEl, 'rgb')) : undefined

    return {
      bold:       bEl ? true : undefined,
      italic:     iEl ? true : undefined,
      fontSize:   szVal && szVal > 0 ? szVal : undefined,
      fontFamily: nameVal,
      color:      colorRgb,
    }
  })

  // Parse fills (index 0 and 1 are reserved in XLSX)
  const fillsEl = qs(doc, 'fills')
  const fillEls = fillsEl ? qsAll(fillsEl, 'fill') : []
  const fills: FillInfo[] = fillEls.map(f => {
    const pf = qs(f, 'patternFill')
    if (!pf) return {}
    const pt = attr(pf, 'patternType') ?? ''
    if (pt === 'none' || pt === 'gray125') return {}
    const fgColor = qs(pf, 'fgColor')
    const bg = fgColor ? parseArgbColor(attr(fgColor, 'rgb') ?? attr(fgColor, 'indexed') ?? null) : undefined
    return { backgroundColor: bg }
  })

  // cellXfs
  const cellXfs = qs(doc, 'cellXfs')
  const xfs     = cellXfs ? qsAll(cellXfs, 'xf') : []

  return function getStyle(xfIndex: number): CellStyle {
    const xf = xfs[xfIndex]
    if (!xf) return { isDate: false }

    const numFmtId = parseInt(attr(xf, 'numFmtId') ?? '-1', 10)
    const isDate   = !isNaN(numFmtId) && (
      BUILTIN_DATE_IDS.has(numFmtId) || (numFmtMap.has(numFmtId) && isDateFormat(numFmtMap.get(numFmtId)!))
    )

    const fontId = parseInt(attr(xf, 'fontId') ?? '-1', 10)
    const fillId = parseInt(attr(xf, 'fillId') ?? '-1', 10)

    const font: FontInfo = (fontId >= 0 && fontId < fonts.length) ? (fonts[fontId] ?? {}) : {}
    const fill: FillInfo = (fillId >= 0 && fillId < fills.length) ? (fills[fillId] ?? {}) : {}

    return {
      isDate,
      bold:            font.bold,
      italic:          font.italic,
      fontSize:        font.fontSize,
      fontFamily:      font.fontFamily,
      color:           font.color,
      backgroundColor: fill.backgroundColor,
    }
  }
}
