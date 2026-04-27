import { describe, it, expect } from 'vitest'
import { Workbook } from 'exceljs'
import { xlsxAdapter } from '../../../src/adapters/xlsx/index'

async function makeXlsxBuffer(rows: (string | number)[][]): Promise<ArrayBuffer> {
  const wb = new Workbook()
  const ws = wb.addWorksheet('Sheet1')
  for (const row of rows) ws.addRow(row)
  const buf = await wb.xlsx.writeBuffer()
  // writeBuffer returns a Buffer (Node) or ArrayBuffer-like; normalise to ArrayBuffer
  if (buf instanceof ArrayBuffer) return buf
  const b = buf as Buffer
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('xlsxAdapter', () => {
  it('parses a simple spreadsheet into a table block', async () => {
    const buf  = await makeXlsxBuffer([['Name', 'Age'], ['Alice', 30], ['Bob', 25]])
    const file = new File([buf], 'test.xlsx')
    const result = await xlsxAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const table = result.value.blocks.find((b: any) => b.type === 'table')
    expect(table).toBeDefined()
    if (!table || table.type !== 'table') return
    expect(table.rows.length).toBe(3)
    expect(table.rows[0]!.cells[0]!.isHeader).toBe(true)
  })

  it('returns CORRUPT_FILE for invalid data', async () => {
    const corrupt = new Uint8Array(512)
    corrupt[0] = 0x50; corrupt[1] = 0x4B; corrupt[2] = 0x03; corrupt[3] = 0x04
    corrupt.fill(0xFF, 4)
    const file   = new File([corrupt], 'bad.xlsx')
    const result = await xlsxAdapter.parse(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('respects AbortSignal', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const buf    = await makeXlsxBuffer([['A', 'B']])
    const result = await xlsxAdapter.parse(new File([buf], 'x.xlsx'), { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  it('detects header row (all strings in first row)', async () => {
    const buf  = await makeXlsxBuffer([['Name', 'Score'], ['Alice', 100]])
    const file = new File([buf], 'test.xlsx')
    const result = await xlsxAdapter.parse(file)
    if (!result.ok) return
    const table = result.value.blocks.find((b: any) => b.type === 'table')
    if (!table || table.type !== 'table') return
    expect(table.rows[0]!.cells[0]!.isHeader).toBe(true)
    expect(table.rows[1]!.cells[0]!.isHeader).toBe(false)
  })

  it('includes sheetNames in meta', async () => {
    const buf  = await makeXlsxBuffer([['a']])
    const file = new File([buf], 'test.xlsx')
    const result = await xlsxAdapter.parse(file)
    if (!result.ok) return
    expect(result.value.meta?.sheetNames).toContain('Sheet1')
  })
})
