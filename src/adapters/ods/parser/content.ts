import type {
  Block,
  TableBlock,
  TableRow,
  TableCell,
  Inline,
} from '../../../core/model/types'
import { attr } from '../xml'

const MAX_ROWS = 5000
// Guard against LibreOffice-style trailing column repetition (e.g. 1024 empty cols)
const MAX_COLS = 1024

// ─── Public entry ─────────────────────────────────────────────────────────────

export function parseOdsContent(contentXml: Document): Block[] {
  const blocks: Block[] = []

  const tables = contentXml.getElementsByTagNameNS('*', 'table')
  const tableCount = tables.length

  for (let t = 0; t < tableCount; t++) {
    const tableEl = tables[t]
    if (!tableEl) continue

    const sheetName = attr(tableEl, 'table:name', 'name') ?? `Sheet${t + 1}`

    if (tableCount > 1) {
      blocks.push({ type: 'heading', level: 2, content: [{ type: 'text', text: sheetName }] })
    }

    const { tableBlock, truncated, totalRows } = parseSheet(tableEl)
    blocks.push(tableBlock)

    if (truncated) {
      blocks.push({
        type: 'unknown',
        raw: `Sheet "${sheetName}" truncated: showing first ${MAX_ROWS} of ${totalRows} rows.`,
      })
    }
  }

  return blocks
}

// ─── Sheet parsing ────────────────────────────────────────────────────────────

function parseSheet(tableEl: Element): { tableBlock: TableBlock; truncated: boolean; totalRows: number } {
  const rows: TableRow[] = []
  let totalRows = 0
  let truncated = false
  let firstRowProcessed = false
  let isHeaderRow = false // will be determined from first row

  const rowEls = tableEl.getElementsByTagNameNS('*', 'table-row')

  for (let r = 0; r < rowEls.length; r++) {
    const rowEl = rowEls[r]
    if (!rowEl) continue

    const repeatStr = attr(rowEl, 'table:number-rows-repeated', 'number-rows-repeated')
    const repeat = repeatStr ? Math.max(1, parseInt(repeatStr, 10)) : 1

    // Parse the logical cells for this row template
    const cellValues = parseCellValues(rowEl)

    // Determine if this is a trailing empty row (all cells empty) — skip if repeated many times
    const allEmpty = cellValues.every(v => v.text === '')
    if (allEmpty && repeat > 1) {
      // These are LibreOffice padding rows — count but don't emit
      totalRows += repeat
      continue
    }

    // Determine header status from first non-empty row
    if (!firstRowProcessed) {
      isHeaderRow = cellValues.length > 0 && cellValues.every(v => v.text !== '' && !v.isNumeric)
      firstRowProcessed = true
    }

    const timesToRepeat = Math.min(repeat, MAX_ROWS - rows.length)

    for (let i = 0; i < timesToRepeat; i++) {
      const isHeader = rows.length === 0 && isHeaderRow
      const cells: TableCell[] = cellValues.map(v => ({
        content: [{ type: 'text', text: v.text }] as Inline[],
        isHeader,
        ...(v.colspan > 1 ? { colspan: v.colspan } : {}),
      }))
      rows.push({ cells })
    }

    totalRows += repeat

    if (rows.length >= MAX_ROWS) {
      truncated = totalRows > MAX_ROWS
      // Count remaining rows for the truncation message
      for (let remaining = r + 1; remaining < rowEls.length; remaining++) {
        const remEl = rowEls[remaining]
        if (!remEl) continue
        const remRepeat = attr(remEl, 'table:number-rows-repeated', 'number-rows-repeated')
        totalRows += remRepeat ? Math.max(1, parseInt(remRepeat, 10)) : 1
      }
      break
    }
  }

  return { tableBlock: { type: 'table', rows }, truncated, totalRows }
}

// ─── Cell parsing ─────────────────────────────────────────────────────────────

type CellValue = { text: string; isNumeric: boolean; colspan: number }

function parseCellValues(rowEl: Element): CellValue[] {
  const result: CellValue[] = []
  const cellEls = rowEl.getElementsByTagNameNS('*', 'table-cell')

  for (let c = 0; c < cellEls.length && result.length < MAX_COLS; c++) {
    const cellEl = cellEls[c]
    if (!cellEl) continue

    const repeatStr = attr(cellEl, 'table:number-columns-repeated', 'number-columns-repeated')
    const repeat = repeatStr ? Math.max(1, parseInt(repeatStr, 10)) : 1

    const colspanStr = attr(cellEl, 'table:number-columns-spanned', 'number-columns-spanned')
    const colspan = colspanStr ? Math.max(1, parseInt(colspanStr, 10)) : 1

    const value = extractCellValue(cellEl)

    // If it's an empty repeated cell, it's likely LibreOffice column padding — skip excess
    if (value.text === '' && repeat > 1) {
      // Only add up to MAX_COLS
      const toAdd = Math.min(repeat, MAX_COLS - result.length)
      for (let i = 0; i < toAdd; i++) {
        result.push({ text: '', isNumeric: false, colspan: 1 })
      }
    } else {
      const toAdd = Math.min(repeat, MAX_COLS - result.length)
      for (let i = 0; i < toAdd; i++) {
        result.push({ text: value.text, isNumeric: value.isNumeric, colspan: i === 0 ? colspan : 1 })
      }
    }
  }

  // Trim trailing empty cells
  while (result.length > 0 && result[result.length - 1]?.text === '') {
    result.pop()
  }

  return result
}

function extractCellValue(cellEl: Element): { text: string; isNumeric: boolean } {
  const valueType = attr(cellEl, 'office:value-type', 'value-type')

  if (!valueType) {
    return { text: '', isNumeric: false }
  }

  switch (valueType) {
    case 'string': {
      // Read all <text:p> content
      const ps = cellEl.getElementsByTagNameNS('*', 'p')
      const texts = Array.from(ps).map(p => p.textContent ?? '').filter(Boolean)
      return { text: texts.join('\n'), isNumeric: false }
    }
    case 'float':
    case 'percentage':
    case 'currency': {
      const val = attr(cellEl, 'office:value', 'value')
      if (val !== null) return { text: val, isNumeric: true }
      // Fallback to text:p
      const ps = cellEl.getElementsByTagNameNS('*', 'p')
      const text = Array.from(ps).map(p => p.textContent ?? '').join('')
      return { text, isNumeric: true }
    }
    case 'date': {
      const val = attr(cellEl, 'office:date-value', 'date-value')
      return { text: val ?? '', isNumeric: false }
    }
    case 'boolean': {
      const val = attr(cellEl, 'office:boolean-value', 'boolean-value')
      return { text: val ?? '', isNumeric: false }
    }
    case 'time': {
      // Read text:p for display representation
      const ps = cellEl.getElementsByTagNameNS('*', 'p')
      const text = Array.from(ps).map(p => p.textContent ?? '').join('')
      return { text, isNumeric: false }
    }
    default: {
      // Unknown type — try text:p
      const ps = cellEl.getElementsByTagNameNS('*', 'p')
      const text = Array.from(ps).map(p => p.textContent ?? '').join('')
      return { text, isNumeric: false }
    }
  }
}
