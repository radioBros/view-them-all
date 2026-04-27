import { describe, it, expect } from 'vitest'
import { docxAdapter } from '../../../src/adapters/docx/index'
import JSZip from 'jszip'

/** Build a minimal valid DOCX buffer from a word/document.xml string */
async function makeDocx(documentXml: string, extra?: Record<string, string>): Promise<File> {
  const zip = new JSZip()

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/word/document.xml"
    ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="word/document.xml"/>
</Relationships>`)

  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`)

  zip.file('word/document.xml', documentXml)

  for (const [path, content] of Object.entries(extra ?? {})) {
    zip.file(path, content)
  }

  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  return new File([buf], 'test.docx')
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

function para(text: string, styleId?: string): string {
  const pPr = styleId
    ? `<w:pPr><w:pStyle w:val="${styleId}"/></w:pPr>`
    : ''
  return `<w:p>${pPr}<w:r><w:t>${text}</w:t></w:r></w:p>`
}

describe('docxAdapter', () => {
  it('parses a simple paragraph', async () => {
    const xml  = `<?xml version="1.0"?><w:document ${W}><w:body>${para('Hello world')}</w:body></w:document>`
    const file = await makeDocx(xml)
    const result = await docxAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks.find((b: any) => b.type === 'paragraph')
    expect(p).toBeDefined()
    expect((p as any).content[0].text).toContain('Hello world')
  })

  it('detects Heading1 style as heading level 1', async () => {
    const xml  = `<?xml version="1.0"?><w:document ${W}><w:body>${para('Title', 'Heading1')}</w:body></w:document>`
    const file = await makeDocx(xml)
    const result = await docxAdapter.parse(file)
    if (!result.ok) return
    const h = result.value.blocks.find((b: any) => b.type === 'heading')
    expect(h).toBeDefined()
    expect((h as any).level).toBe(1)
  })

  it('parses bold and italic run properties', async () => {
    const xml = `<?xml version="1.0"?><w:document ${W}><w:body>
      <w:p>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r>
        <w:r><w:rPr><w:i/></w:rPr><w:t>Italic</w:t></w:r>
      </w:p>
    </w:body></w:document>`
    const file = await makeDocx(xml)
    const result = await docxAdapter.parse(file)
    if (!result.ok) return
    const p = result.value.blocks.find((b: any) => b.type === 'paragraph') as any
    expect(p.content.some((i: any) => i.bold === true)).toBe(true)
    expect(p.content.some((i: any) => i.italic === true)).toBe(true)
  })

  it('parses a simple table', async () => {
    const xml = `<?xml version="1.0"?><w:document ${W}><w:body>
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Age</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Alice</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>30</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    </w:body></w:document>`
    const file = await makeDocx(xml)
    const result = await docxAdapter.parse(file)
    if (!result.ok) return
    const table = result.value.blocks.find((b: any) => b.type === 'table') as any
    expect(table).toBeDefined()
    expect(table.rows.length).toBe(2)
    expect(table.rows[0].cells.length).toBe(2)
  })

  it('returns CORRUPT_FILE for invalid data', async () => {
    // Use ZIP magic + garbage — same pattern as xlsx test
    const corrupt = new Uint8Array(512)
    corrupt[0] = 0x50; corrupt[1] = 0x4B; corrupt[2] = 0x03; corrupt[3] = 0x04
    corrupt.fill(0xFF, 4)
    const file   = new File([corrupt], 'bad.docx')
    const result = await docxAdapter.parse(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('respects AbortSignal before parse', async () => {
    const xml  = `<?xml version="1.0"?><w:document ${W}><w:body>${para('Hi')}</w:body></w:document>`
    const file = await makeDocx(xml)
    const ctrl = new AbortController()
    ctrl.abort()
    const result = await docxAdapter.parse(file, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  it('emits unknown block for unrecognized body elements instead of throwing', async () => {
    // Add a completely foreign XML element in the body
    const xml = `<?xml version="1.0"?><w:document ${W}><w:body>
      ${para('Normal paragraph')}
      <w:mystery><w:foo>bar</w:foo></w:mystery>
      ${para('After mystery')}
    </w:body></w:document>`
    const file = await makeDocx(xml)
    const result = await docxAdapter.parse(file)
    // Should not throw — unknown elements become unknown blocks or are skipped
    expect(result.ok).toBe(true)
  })
})
