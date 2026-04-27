import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { odtAdapter } from '../../../src/adapters/odt/index'

// ─── Fixture builder ──────────────────────────────────────────────────────────

const NS = `
  xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:xlink="http://www.w3.org/1999/xlink"
`.trim()

async function makeOdtBuffer(bodyContent: string): Promise<ArrayBuffer> {
  const zip = new JSZip()
  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS}>
  <office:body>
    <office:text>
      ${bodyContent}
    </office:text>
  </office:body>
</office:document-content>`
  zip.file('content.xml', contentXml)
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text')
  return zip.generateAsync({ type: 'arraybuffer' })
}

async function makeOdtFile(bodyContent: string): Promise<File> {
  const buf = await makeOdtBuffer(bodyContent)
  return new File([buf], 'test.odt')
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('odtAdapter', () => {
  it('parses headings with outline-level', async () => {
    const file = await makeOdtFile(`
      <text:h text:outline-level="1">Main Title</text:h>
      <text:h text:outline-level="2">Sub Title</text:h>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const headings = result.value.blocks.filter((b: any) => b.type === 'heading')
    expect(headings.length).toBeGreaterThanOrEqual(2)
    expect(headings[0]).toMatchObject({ type: 'heading', level: 1 })
    expect(headings[0].content[0].text).toContain('Main Title')
    expect(headings[1]).toMatchObject({ type: 'heading', level: 2 })
  })

  it('parses paragraphs', async () => {
    const file = await makeOdtFile(`
      <text:p>Hello world</text:p>
      <text:p>Second paragraph</text:p>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const paras = result.value.blocks.filter((b: any) => b.type === 'paragraph')
    expect(paras.length).toBeGreaterThanOrEqual(2)
    expect(paras[0].content[0].text).toContain('Hello world')
  })

  it('detects heading from style name (Heading_20_1 pattern)', async () => {
    const file = await makeOdtFile(`
      <text:p text:style-name="Heading_20_1">Styled Heading</text:p>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const heading = result.value.blocks.find((b: any) => b.type === 'heading')
    expect(heading).toBeDefined()
    expect(heading?.level).toBe(1)
  })

  it('parses bold and italic spans', async () => {
    const file = await makeOdtFile(`
      <text:p>
        <text:span text:style-name="BoldStyle">Bold text</text:span>
        <text:span text:style-name="ItalicStyle">Italic text</text:span>
      </text:p>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const para = result.value.blocks.find((b: any) => b.type === 'paragraph') as any
    expect(para).toBeDefined()
    expect(para.content.some((i: any) => i.bold === true)).toBe(true)
    expect(para.content.some((i: any) => i.italic === true)).toBe(true)
  })

  it('parses hyperlinks in paragraphs', async () => {
    const file = await makeOdtFile(`
      <text:p>
        <text:a xlink:href="https://example.com">Example Link</text:a>
      </text:p>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const para = result.value.blocks.find((b: any) => b.type === 'paragraph') as any
    expect(para).toBeDefined()
    const link = para.content.find((i: any) => i.type === 'link')
    expect(link).toBeDefined()
    expect(link.href).toBe('https://example.com')
    expect(link.text).toBe('Example Link')
  })

  it('rejects javascript: hrefs', async () => {
    const file = await makeOdtFile(`
      <text:p>
        <text:a xlink:href="javascript:alert(1)">Bad Link</text:a>
      </text:p>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const para = result.value.blocks.find((b: any) => b.type === 'paragraph') as any
    expect(para).toBeDefined()
    // link should not appear — falls back to inline text or nothing
    const link = para.content.find((i: any) => i.type === 'link')
    expect(link).toBeUndefined()
  })

  it('parses an unordered list', async () => {
    const file = await makeOdtFile(`
      <text:list>
        <text:list-item><text:p>Item A</text:p></text:list-item>
        <text:list-item><text:p>Item B</text:p></text:list-item>
      </text:list>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const list = result.value.blocks.find((b: any) => b.type === 'list') as any
    expect(list).toBeDefined()
    expect(list.ordered).toBe(false)
    expect(list.items.length).toBe(2)
    expect(list.items[0].content[0].text).toContain('Item A')
  })

  it('parses an ordered list (Numbered style)', async () => {
    const file = await makeOdtFile(`
      <text:list text:style-name="Numbered_List">
        <text:list-item><text:p>First</text:p></text:list-item>
        <text:list-item><text:p>Second</text:p></text:list-item>
      </text:list>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const list = result.value.blocks.find((b: any) => b.type === 'list') as any
    expect(list).toBeDefined()
    expect(list.ordered).toBe(true)
  })

  it('parses a nested list', async () => {
    const file = await makeOdtFile(`
      <text:list>
        <text:list-item>
          <text:p>Parent</text:p>
          <text:list>
            <text:list-item><text:p>Child</text:p></text:list-item>
          </text:list>
        </text:list-item>
      </text:list>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const list = result.value.blocks.find((b: any) => b.type === 'list') as any
    expect(list).toBeDefined()
    expect(list.items[0].children).toBeDefined()
    expect(list.items[0].children.items[0].content[0].text).toContain('Child')
  })

  it('parses a table with header row', async () => {
    const file = await makeOdtFile(`
      <table:table>
        <table:table-row>
          <table:table-cell><text:p>Name</text:p></table:table-cell>
          <table:table-cell><text:p>Age</text:p></table:table-cell>
        </table:table-row>
        <table:table-row>
          <table:table-cell><text:p>Alice</text:p></table:table-cell>
          <table:table-cell><text:p>30</text:p></table:table-cell>
        </table:table-row>
      </table:table>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table).toBeDefined()
    expect(table.rows.length).toBe(2)
    expect(table.rows[0].cells.length).toBe(2)
    expect(table.rows[0].cells[0].isHeader).toBe(true)
    expect(table.rows[1].cells[0].isHeader).toBe(false)
  })

  it('parses table cell colspan', async () => {
    const file = await makeOdtFile(`
      <table:table>
        <table:table-row>
          <table:table-cell table:number-columns-spanned="2"><text:p>Merged</text:p></table:table-cell>
        </table:table-row>
      </table:table>
    `)
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table).toBeDefined()
    expect(table.rows[0].cells[0].colspan).toBe(2)
  })

  it('returns CORRUPT_FILE for corrupt ZIP', async () => {
    const corrupt = new Uint8Array(512)
    corrupt[0] = 0x50; corrupt[1] = 0x4B; corrupt[2] = 0x03; corrupt[3] = 0x04
    corrupt.fill(0xFF, 4)
    const file = new File([corrupt], 'bad.odt')
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('respects AbortSignal before parse', async () => {
    const file = await makeOdtFile('<text:p>Hello</text:p>')
    const ctrl = new AbortController()
    ctrl.abort()
    const result = await odtAdapter.parse(file, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  it('returns CORRUPT_FILE when content.xml is missing', async () => {
    const zip = new JSZip()
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text')
    // No content.xml
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([buf], 'empty.odt')
    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('resolves bold/italic/color/fontSize from automatic-styles in content.xml', async () => {
    const FO = 'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"'
    const STYLE = 'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
    const zip = new JSZip()
    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS}
  ${FO}
  ${STYLE}>
  <office:automatic-styles>
    <style:style style:name="StrongSpan" style:family="text">
      <style:text-properties fo:font-weight="bold" fo:color="#cc0000" fo:font-size="18pt"/>
    </style:style>
    <style:style style:name="EmSpan" style:family="text">
      <style:text-properties fo:font-style="italic"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      <text:p>
        <text:span text:style-name="StrongSpan">Bold Red 18pt</text:span>
        <text:span text:style-name="EmSpan">Italic Text</text:span>
      </text:p>
    </office:text>
  </office:body>
</office:document-content>`
    zip.file('content.xml', contentXml)
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text')
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([buf], 'styles.odt')

    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const para = result.value.blocks.find((b: any) => b.type === 'paragraph') as any
    expect(para).toBeDefined()

    const boldInline = para.content.find((i: any) => i.text === 'Bold Red 18pt')
    expect(boldInline).toBeDefined()
    expect(boldInline.bold).toBe(true)
    expect(boldInline.color).toBe('#cc0000')
    expect(boldInline.fontSize).toBe(18)

    const italicInline = para.content.find((i: any) => i.text === 'Italic Text')
    expect(italicInline).toBeDefined()
    expect(italicInline.italic).toBe(true)
  })

  it('resolves cell backgroundColor from automatic-styles in content.xml', async () => {
    const FO    = 'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"'
    const STYLE = 'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
    const zip = new JSZip()
    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS}
  ${FO}
  ${STYLE}>
  <office:automatic-styles>
    <style:style style:name="BlueCell" style:family="table-cell">
      <style:table-cell-properties fo:background-color="#0000ff"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      <table:table>
        <table:table-row>
          <table:table-cell table:style-name="BlueCell">
            <text:p>Blue</text:p>
          </table:table-cell>
          <table:table-cell>
            <text:p>No color</text:p>
          </table:table-cell>
        </table:table-row>
      </table:table>
    </office:text>
  </office:body>
</office:document-content>`
    zip.file('content.xml', contentXml)
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text')
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([buf], 'cellbg.odt')

    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table).toBeDefined()
    const blueCell = table.rows[0].cells[0]
    expect(blueCell.backgroundColor).toBe('#0000ff')
    const plainCell = table.rows[0].cells[1]
    expect(plainCell.backgroundColor).toBeUndefined()
  })

  it('extracts meta from meta.xml', async () => {
    const zip = new JSZip()
    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS}>
  <office:body><office:text><text:p>Hi</text:p></office:text></office:body>
</office:document-content>`
    const metaXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NS}
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0">
  <office:meta>
    <dc:title>My Document</dc:title>
    <dc:creator>Jane Doe</dc:creator>
    <dc:date>2024-01-15T10:30:00</dc:date>
  </office:meta>
</office:document-meta>`
    zip.file('content.xml', contentXml)
    zip.file('meta.xml', metaXml)
    zip.file('mimetype', 'application/vnd.oasis.opendocument.text')
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([buf], 'meta.odt')

    const result = await odtAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.meta?.title).toBe('My Document')
    expect(result.value.meta?.author).toBe('Jane Doe')
  })
})
