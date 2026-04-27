import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Block, TableRow, Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { detectDelimiter, parseCSV } from './parser'

const MAX_ROWS = 5000

/**
 * Returns true if the value looks like a number (integer or decimal, optionally
 * with a leading minus sign).
 */
function isNumericLike(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value.trim())
}

/**
 * Determine whether the first row should be treated as a header row.
 *
 * Rule: header if every cell in row[0] is a non-empty string AND at least one
 * cell in row[1] looks numeric.
 */
function detectHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false

  const firstRow  = rows[0]!
  const secondRow = rows[1]!

  const allNonEmpty  = firstRow.every(cell => cell.trim() !== '')
  const someNumeric  = secondRow.some(cell => isNumericLike(cell))

  return allNonEmpty && someNumeric
}

export const csvAdapter: Adapter = {
  name: 'csv',
  extensions: ['csv', 'tsv'],
  mimeTypes: ['text/csv', 'text/tab-separated-values'],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted before start' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    try {
      const decoder  = new TextDecoder('utf-8', { fatal: false })
      const text     = decoder.decode(buffer)

      // Detect delimiter from the first line
      const firstLine = text.split(/\r?\n/)[0] ?? ''
      const delimiter = detectDelimiter(firstLine)

      // Parse all rows (up to MAX_ROWS + 1 so we can detect truncation)
      const allRows = parseCSV(text, delimiter, MAX_ROWS + 1)

      const truncated = allRows.length > MAX_ROWS
      const rows      = truncated ? allRows.slice(0, MAX_ROWS) : allRows

      const isHeader = detectHeader(rows)

      // Build TableRows
      const tableRows: TableRow[] = rows.map((rowCells, rowIndex) => ({
        cells: rowCells.map(cellValue => ({
          content:  [{ type: 'text' as const, text: cellValue }],
          isHeader: isHeader && rowIndex === 0,
        })),
      }))

      const blocks: Block[] = [{ type: 'table', rows: tableRows }]

      if (truncated) {
        blocks.push({
          type: 'unknown',
          raw:  `Table truncated: showing first ${MAX_ROWS} of ${allRows.length}+ rows.`,
        })
      }

      return ok({ blocks, meta: {} })
    } catch (e) {
      return err({ code: 'PARSE_FAILED', message: String(e), source: e })
    }
  },
}
