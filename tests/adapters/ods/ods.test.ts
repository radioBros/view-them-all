import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { odsAdapter } from '../../../src/adapters/ods/index'

// ─── Fixture builder ──────────────────────────────────────────────────────────

const NS = `
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
`.trim()

async function makeOdsBuffer(sheetsXml: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS}>
  <office:body>
    <office:spreadsheet>
      ${sheetsXml}
    </office:spreadsheet>
  </office:body>
</office:document-content>`
  zip.file('content.xml', contentXml)
  zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet')
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function makeOdsFile(sheetsXml: string): Promise<File> {
  const buf = await makeOdsBuffer(sheetsXml)
  return new File([buf], 'test.ods')
}

function sheet(name: string, rowsXml: string): string {
  return `<table:table table:name="${name}">${rowsXml}</table:table>`
}

function row(cellsXml: string): string {
  return `<table:table-row>${cellsXml}</table:table-row>`
}

function strCell(value: string): string {
  return `<table:table-cell office:value-type="string"><text:p>${value}</text:p></table:table-cell>`
}

function floatCell(value: number): string {
  return `<table:table-cell office:value-type="float" office:value="${value}"><text:p>${value}</text:p></table:table-cell>`
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('odsAdapter', () => {
  it('parses a single sheet into a TableBlock', async () => {
    const file = await makeOdsFile(sheet('Sheet1', `
      ${row(strCell('Name') + strCell('Age'))}
      ${row(strCell('Alice') + floatCell(30))}
    `))
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table).toBeDefined()
    expect(table.rows.length).toBe(2)
    expect(table.rows[0].cells[0].content[0].text).toBe('Name')
    expect(table.rows[1].cells[0].content[0].text).toBe('Alice')
  })

  it('detects header row when all first-row cells are non-empty strings', async () => {
    const file = await makeOdsFile(sheet('Sheet1', `
      ${row(strCell('Name') + strCell('Score'))}
      ${row(strCell('Alice') + floatCell(100))}
    `))
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table.rows[0].cells[0].isHeader).toBe(true)
    expect(table.rows[0].cells[1].isHeader).toBe(true)
    expect(table.rows[1].cells[0].isHeader).toBe(false)
  })

  it('does not mark header when first row contains numbers', async () => {
    const file = await makeOdsFile(sheet('Sheet1', `
      ${row(floatCell(1) + floatCell(2))}
      ${row(floatCell(3) + floatCell(4))}
    `))
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table.rows[0].cells[0].isHeader).toBe(false)
  })

  it('handles float cell values', async () => {
    const file = await makeOdsFile(sheet('Data', `
      ${row(strCell('Value'))}
      ${row(floatCell(3.14))}
    `))
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table.rows[1].cells[0].content[0].text).toBe('3.14')
  })

  it('handles date cell values', async () => {
    const dateXml = `<table:table-cell office:value-type="date" office:date-value="2024-03-15"><text:p>03/15/2024</text:p></table:table-cell>`
    const file = await makeOdsFile(sheet('Sheet1', row(dateXml)))
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table.rows[0].cells[0].content[0].text).toBe('2024-03-15')
  })

  it('handles boolean cell values', async () => {
    const boolXml = `<table:table-cell office:value-type="boolean" office:boolean-value="true"><text:p>TRUE</text:p></table:table-cell>`
    const file = await makeOdsFile(sheet('Sheet1', row(boolXml)))
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table.rows[0].cells[0].content[0].text).toBe('true')
  })

  it('handles column-span', async () => {
    const spannedCell = `<table:table-cell office:value-type="string" table:number-columns-spanned="2"><text:p>Merged</text:p></table:table-cell>`
    const file = await makeOdsFile(sheet('Sheet1', row(spannedCell)))
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table.rows[0].cells[0].colspan).toBe(2)
  })

  it('parses multi-sheet ODS: emits heading + table per sheet', async () => {
    const sheetsXml =
      sheet('Sales', row(strCell('Product') + strCell('Revenue'))) +
      sheet('Costs', row(strCell('Item') + strCell('Amount')))

    const file = await makeOdsFile(sheetsXml)
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const blocks = result.value.blocks
    const headings = blocks.filter((b: any) => b.type === 'heading')
    const tables = blocks.filter((b: any) => b.type === 'table')

    expect(headings.length).toBe(2)
    expect(tables.length).toBe(2)
    expect(headings[0].content[0].text).toBe('Sales')
    expect(headings[1].content[0].text).toBe('Costs')
  })

  it('includes sheetNames in meta', async () => {
    const file = await makeOdsFile(sheet('MySheet', row(strCell('A'))))
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.meta?.sheetNames).toContain('MySheet')
  })

  it('handles large column repetition (LibreOffice padding) without OOM', async () => {
    // Simulate LibreOffice-style: 2 real cells + many empty repeated cells
    const bigRepeatRow = `<table:table-row>
      ${strCell('A')}${strCell('B')}
      <table:table-cell table:number-columns-repeated="1000"/>
    </table:table-row>`
    const file = await makeOdsFile(sheet('Sheet1', bigRepeatRow))
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    // Should only have 2 non-empty cells (trailing empty trimmed)
    expect(table.rows[0].cells.length).toBe(2)
  })

  it('returns CORRUPT_FILE for corrupt ZIP', async () => {
    const corrupt = new Uint8Array(512)
    corrupt[0] = 0x50; corrupt[1] = 0x4B; corrupt[2] = 0x03; corrupt[3] = 0x04
    corrupt.fill(0xFF, 4)
    const file = new File([corrupt], 'bad.ods')
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('respects AbortSignal before parse', async () => {
    const file = await makeOdsFile(sheet('Sheet1', row(strCell('A'))))
    const ctrl = new AbortController()
    ctrl.abort()
    const result = await odsAdapter.parse(file, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  it('returns CORRUPT_FILE when content.xml is missing', async () => {
    const zip = new JSZip()
    zip.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet')
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([buf], 'empty.ods')
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('handles number-columns-repeated for non-empty cells', async () => {
    const repeatedCell = `<table:table-cell office:value-type="string" table:number-columns-repeated="3"><text:p>X</text:p></table:table-cell>`
    const file = await makeOdsFile(sheet('Sheet1', row(repeatedCell)))
    const result = await odsAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table.rows[0].cells.length).toBe(3)
    expect(table.rows[0].cells.every((c: any) => c.content[0].text === 'X')).toBe(true)
  })
})
