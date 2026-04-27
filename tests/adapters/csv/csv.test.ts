import { describe, it, expect } from 'vitest'
import { csvAdapter } from '../../../src/adapters/csv/index'

function makeFile(content: string, name = 'test.csv'): File {
  return new File([new TextEncoder().encode(content)], name, { type: 'text/csv' })
}

describe('csvAdapter', () => {
  it('parses a simple CSV into a TableBlock with correct rows and columns', async () => {
    const file   = makeFile('a,b,c\n1,2,3\n4,5,6\n')
    const result = await csvAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const table = result.value.blocks.find((b: any) => b.type === 'table')
    expect(table).toBeDefined()
    if (!table || table.type !== 'table') return
    expect(table.rows.length).toBe(3)
    expect(table.rows[0]!.cells.length).toBe(3)
    expect(table.rows[1]!.cells[0]!.content[0]).toMatchObject({ type: 'text', text: '1' })
  })

  it('detects header row when first row is all non-empty strings and second has numerics', async () => {
    const file   = makeFile('Name,Age,Score\nAlice,30,95.5\nBob,25,88\n')
    const result = await csvAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const table = result.value.blocks.find((b: any) => b.type === 'table')
    if (!table || table.type !== 'table') return
    expect(table.rows[0]!.cells[0]!.isHeader).toBe(true)
    expect(table.rows[1]!.cells[0]!.isHeader).toBe(false)
  })

  it('handles quoted fields containing commas', async () => {
    const file   = makeFile('"last, first",age\n"Smith, John",42\n')
    const result = await csvAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const table = result.value.blocks.find((b: any) => b.type === 'table')
    if (!table || table.type !== 'table') return
    expect(table.rows[0]!.cells[0]!.content[0]).toMatchObject({ type: 'text', text: 'last, first' })
    expect(table.rows[1]!.cells[0]!.content[0]).toMatchObject({ type: 'text', text: 'Smith, John' })
  })

  it('parses TSV (tab-delimited) files', async () => {
    const file   = makeFile('col1\tcol2\tcol3\nfoo\tbar\tbaz\n', 'data.tsv')
    const result = await csvAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const table = result.value.blocks.find((b: any) => b.type === 'table')
    if (!table || table.type !== 'table') return
    expect(table.rows.length).toBe(2)
    expect(table.rows[0]!.cells.length).toBe(3)
    expect(table.rows[0]!.cells[1]!.content[0]).toMatchObject({ type: 'text', text: 'col2' })
  })

  it('respects AbortSignal', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const file   = makeFile('a,b\n1,2\n')
    const result = await csvAdapter.parse(file, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  it('handles empty file — returns TableBlock with 0 rows', async () => {
    const file   = makeFile('')
    const result = await csvAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const table = result.value.blocks.find((b: any) => b.type === 'table')
    expect(table).toBeDefined()
    if (!table || table.type !== 'table') return
    expect(table.rows.length).toBe(0)
  })
})
