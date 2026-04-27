import type { TableBlock, TableRow, TableCell } from '../../../core/model/types'
import type { TextInline, UnknownInline } from '../../../core/model/types'
import { parseXml, qs, qsAll, attr } from '../xml'
import { buildMergeMap } from './merges'
import { parseCellElement } from './cell'
import type { CellStyle } from './styles'

function colLettersToNum(col: string): number {
  let n = 0
  for (const ch of col.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n
}

function parseAddress(addr: string | null): { r: number; c: number } | null {
  if (!addr) return null
  const m = addr.match(/^([A-Z]+)(\d+)$/i)
  if (!m) return null
  return { r: parseInt(m[2]!, 10), c: colLettersToNum(m[1]!) }
}

function isTextCell(cEl: Element): boolean {
  const t = cEl.getAttribute('t') ?? ''
  if (t === 's' || t === 'str' || t === 'inlineStr') {
    const v = qs(cEl, 'v')?.textContent
    if (v) return true
    const is = qs(cEl, 'is')
    return is ? (qs(is, 't')?.textContent ?? '') !== '' : false
  }
  return false
}

export interface TableResult {
  block: TableBlock
  totalRows: number
}

export function buildTableBlockFromXml(
  xmlText: string,
  caption: string | undefined,
  sharedStrings: string[],
  getStyle: (xfIndex: number) => CellStyle,
  is1904: boolean,
  maxRows: number,
): TableResult {
  const doc = parseXml(xmlText)
  const empty: TableResult = { block: { type: 'table', rows: [], caption }, totalRows: 0 }

  const sheetData = qs(doc, 'sheetData')
  if (!sheetData) return empty

  // Merge cells
  const mergeRefs = qsAll(doc, 'mergeCell')
    .map(m => attr(m, 'ref') ?? '')
    .filter(Boolean)
  const mergeMap = buildMergeMap(mergeRefs)

  // Determine bounds — prefer <dimension ref="A1:E10">
  let minR = Infinity, maxR = -Infinity, minC = Infinity, maxC = -Infinity
  const dimension = qs(doc, 'dimension')
  const dimRef = attr(dimension, 'ref') ?? ''
  if (dimRef.includes(':')) {
    const [startStr, endStr] = dimRef.split(':')
    const s = parseAddress(startStr ?? null)
    const e = parseAddress(endStr ?? null)
    if (s && e) { minR = s.r; maxR = e.r; minC = s.c; maxC = e.c }
  }

  const rowEls = qsAll(sheetData, 'row')

  // Fallback: scan row elements for bounds
  if (minR === Infinity) {
    for (const rowEl of rowEls) {
      const r = parseInt(attr(rowEl, 'r') ?? '0', 10)
      if (!r) continue
      minR = Math.min(minR, r)
      maxR = Math.max(maxR, r)
      for (const cEl of qsAll(rowEl, 'c')) {
        const a = parseAddress(attr(cEl, 'r'))
        if (a) { minC = Math.min(minC, a.c); maxC = Math.max(maxC, a.c) }
      }
    }
    if (minR === Infinity) return empty
  }

  const totalRows = maxR - minR + 1
  const effectiveMaxR = Math.min(maxR, minR + maxRows - 1)

  // Build row element map
  const rowMap = new Map<number, Element>()
  for (const rowEl of rowEls) {
    const r = parseInt(attr(rowEl, 'r') ?? '0', 10)
    if (r && r >= minR && r <= effectiveMaxR) rowMap.set(r, rowEl)
  }

  // Header detection: all cells in first row are non-empty text type
  const firstRowEl = rowMap.get(minR)
  const firstRowCells = firstRowEl ? qsAll(firstRowEl, 'c') : []
  const hasHeader = firstRowCells.length > 0 && firstRowCells.every(isTextCell)

  const rows: TableRow[] = []

  for (let r = minR; r <= effectiveMaxR; r++) {
    const rowEl = rowMap.get(r)
    const isHeaderRow = hasHeader && r === minR

    // Cell map for this row
    const cellMap = new Map<number, Element>()
    if (rowEl) {
      for (const cEl of qsAll(rowEl, 'c')) {
        const a = parseAddress(attr(cEl, 'r'))
        if (a) cellMap.set(a.c, cEl)
      }
    }

    const cells: TableCell[] = []
    for (let c = minC; c <= maxC; c++) {
      const key = `${r},${c}`
      if (mergeMap.get(key) === 'skip') continue

      const mergeInfo = mergeMap.get(key)
      const cEl = cellMap.get(c)

      const content: (TextInline | UnknownInline)[] = cEl
        ? [parseCellElement(cEl, sharedStrings, getStyle, is1904)]
        : [{ type: 'text', text: '' }]

      // Cell background from fill style
      const cellS = cEl ? cEl.getAttribute('s') : null
      const cellXfIdx = cellS !== null ? parseInt(cellS, 10) : NaN
      const cellStyle = !isNaN(cellXfIdx) ? getStyle(cellXfIdx) : null

      const cell: TableCell = {
        content,
        isHeader: isHeaderRow,
        colspan: mergeInfo && typeof mergeInfo === 'object' && mergeInfo.colspan > 1
          ? mergeInfo.colspan : undefined,
        rowspan: mergeInfo && typeof mergeInfo === 'object' && mergeInfo.rowspan > 1
          ? mergeInfo.rowspan : undefined,
        backgroundColor: cellStyle?.backgroundColor,
      }
      cells.push(cell)
    }

    rows.push({ cells })
  }

  return { block: { type: 'table', rows, caption }, totalRows }
}
