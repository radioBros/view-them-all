import { describe, it, expect } from 'vitest'
import { epubAdapter } from '../../../src/adapters/epub/index'
import JSZip from 'jszip'

async function makeEpubBuffer(chapters: Array<{ title: string; body: string }>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  const containerXml = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`
  zip.file('META-INF/container.xml', containerXml)

  const items    = chapters.map((_, i) => `<item id="ch${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`)
  const itemrefs = chapters.map((_, i) => `<itemref idref="ch${i}"/>`)
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Test Book</dc:title></metadata><manifest>${items.join('')}</manifest><spine>${itemrefs.join('')}</spine></package>`
  zip.file('OEBPS/content.opf', opf)

  chapters.forEach((c, i) => {
    zip.file(`OEBPS/chapter${i}.xhtml`, `<!DOCTYPE html><html><body><h1>${c.title}</h1><p>${c.body}</p></body></html>`)
  })
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('epubAdapter', () => {
  it('parses a single chapter with heading and paragraph', async () => {
    const buf    = await makeEpubBuffer([{ title: 'Chapter One', body: 'Hello EPUB world.' }])
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { blocks, meta } = result.value
    expect(blocks.length).toBeGreaterThan(0)

    const heading = blocks.find((b: any) => b.type === 'heading')
    expect(heading).toBeDefined()
    if (heading && heading.type === 'heading') {
      expect(heading.level).toBe(1)
      const text = heading.content.map((i: any) => i.text ?? '').join('')
      expect(text).toContain('Chapter One')
    }

    const para = blocks.find((b: any) => b.type === 'paragraph')
    expect(para).toBeDefined()
    if (para && para.type === 'paragraph') {
      const text = para.content.map((i: any) => i.text ?? '').join('')
      expect(text).toContain('Hello EPUB world')
    }

    expect(meta!.title).toBe('Test Book')
    expect(meta!.pageCount).toBe(1)
  })

  it('inserts HrBlock between chapters', async () => {
    const buf = await makeEpubBuffer([
      { title: 'Chapter 1', body: 'First chapter content.' },
      { title: 'Chapter 2', body: 'Second chapter content.' },
      { title: 'Chapter 3', body: 'Third chapter content.' },
    ])
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { blocks } = result.value

    // Count HrBlocks
    const hrCount = blocks.filter((b: any) => b.type === 'hr').length
    // Should have N-1 separators = 2 for 3 chapters
    expect(hrCount).toBe(2)

    // HrBlock should not be at the very end
    const lastBlock = blocks[blocks.length - 1]
    expect(lastBlock?.type).not.toBe('hr')
  })

  it('parses multiple heading levels', async () => {
    const zip = new JSZip()
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Headings Book</dc:title></metadata><manifest><item id="ch0" href="chapter0.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch0"/></spine></package>`
    zip.file('OEBPS/content.opf', opf)
    zip.file('OEBPS/chapter0.xhtml', `<!DOCTYPE html><html><body>
      <h1>Heading 1</h1>
      <h2>Heading 2</h2>
      <h3>Heading 3</h3>
      <p>A paragraph</p>
    </body></html>`)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { blocks } = result.value
    const headings = blocks.filter((b: any) => b.type === 'heading')
    expect(headings.length).toBeGreaterThanOrEqual(3)
    if (headings[0]?.type === 'heading') expect(headings[0].level).toBe(1)
    if (headings[1]?.type === 'heading') expect(headings[1].level).toBe(2)
    if (headings[2]?.type === 'heading') expect(headings[2].level).toBe(3)
  })

  it('parses a table', async () => {
    const zip = new JSZip()
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Table Book</dc:title></metadata><manifest><item id="ch0" href="chapter0.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch0"/></spine></package>`
    zip.file('OEBPS/content.opf', opf)
    zip.file('OEBPS/chapter0.xhtml', `<!DOCTYPE html><html><body>
      <table>
        <thead>
          <tr><th>Name</th><th>Age</th></tr>
        </thead>
        <tbody>
          <tr><td>Alice</td><td>30</td></tr>
          <tr><td>Bob</td><td>25</td></tr>
        </tbody>
      </table>
    </body></html>`)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const table = result.value.blocks.find((b: any) => b.type === 'table')
    expect(table).toBeDefined()
    if (!table || table.type !== 'table') return

    // 1 header row + 2 body rows
    expect(table.rows.length).toBe(3)
    // Header cells
    expect(table.rows[0]?.cells[0]?.isHeader).toBe(true)
    expect(table.rows[0]?.cells[1]?.isHeader).toBe(true)
    // Body cells
    expect(table.rows[1]?.cells[0]?.isHeader).toBe(false)

    const nameText = table.rows[0]?.cells[0]?.content.map((i: any) => i.text ?? '').join('')
    expect(nameText).toContain('Name')
  })

  it('parses lists (ordered and unordered)', async () => {
    const zip = new JSZip()
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">List Book</dc:title></metadata><manifest><item id="ch0" href="chapter0.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch0"/></spine></package>`
    zip.file('OEBPS/content.opf', opf)
    zip.file('OEBPS/chapter0.xhtml', `<!DOCTYPE html><html><body>
      <ul>
        <li>Apple</li>
        <li>Banana</li>
      </ul>
      <ol>
        <li>First</li>
        <li>Second</li>
      </ol>
    </body></html>`)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { blocks } = result.value
    const lists = blocks.filter((b: any) => b.type === 'list')
    expect(lists.length).toBeGreaterThanOrEqual(2)

    const unordered = lists.find((b: any) => b.type === 'list' && !b.ordered)
    const ordered   = lists.find((b: any) => b.type === 'list' && b.ordered)
    expect(unordered).toBeDefined()
    expect(ordered).toBeDefined()
    if (unordered?.type === 'list') expect(unordered.items.length).toBe(2)
    if (ordered?.type === 'list')   expect(ordered.items.length).toBe(2)
  })

  it('parses inline markup (bold, italic, links)', async () => {
    const zip = new JSZip()
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Inline Book</dc:title></metadata><manifest><item id="ch0" href="chapter0.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch0"/></spine></package>`
    zip.file('OEBPS/content.opf', opf)
    zip.file('OEBPS/chapter0.xhtml', `<!DOCTYPE html><html><body>
      <p>Normal <strong>bold</strong> and <em>italic</em> and <a href="https://example.com">link</a>.</p>
    </body></html>`)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const para = result.value.blocks.find((b: any) => b.type === 'paragraph') as any
    expect(para).toBeDefined()

    const hasBold   = para.content.some((i: any) => i.bold === true)
    const hasItalic = para.content.some((i: any) => i.italic === true)
    const hasLink   = para.content.some((i: any) => i.type === 'link')
    expect(hasBold).toBe(true)
    expect(hasItalic).toBe(true)
    expect(hasLink).toBe(true)
  })

  it('rejects javascript: links', async () => {
    const zip = new JSZip()
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">JS Book</dc:title></metadata><manifest><item id="ch0" href="chapter0.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch0"/></spine></package>`
    zip.file('OEBPS/content.opf', opf)
    zip.file('OEBPS/chapter0.xhtml', `<!DOCTYPE html><html><body>
      <p><a href="javascript:alert(1)">click me</a></p>
    </body></html>`)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const para = result.value.blocks.find((b: any) => b.type === 'paragraph') as any
    const hasLink = para?.content.some((i: any) => i.type === 'link')
    // Should NOT emit a link for javascript: href
    expect(hasLink).toBe(false)
    // Should still have text
    const hasText = para?.content.some((i: any) => i.type === 'text' && i.text === 'click me')
    expect(hasText).toBe(true)
  })

  it('respects AbortSignal before parse', async () => {
    const buf  = await makeEpubBuffer([{ title: 'Title', body: 'Body' }])
    const ctrl = new AbortController()
    ctrl.abort()
    const result = await epubAdapter.parse(buf, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  it('returns CORRUPT_FILE when META-INF/container.xml is missing', async () => {
    const zip = new JSZip()
    // Deliberately omit META-INF/container.xml
    zip.file('OEBPS/content.opf', '<?xml version="1.0"?><package/>')
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('returns CORRUPT_FILE for invalid ZIP data', async () => {
    const corrupt = new Uint8Array(512)
    corrupt[0] = 0x50; corrupt[1] = 0x4B; corrupt[2] = 0x03; corrupt[3] = 0x04
    corrupt.fill(0xFF, 4)
    const result = await epubAdapter.parse(corrupt.buffer)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('includes meta title and pageCount', async () => {
    const buf    = await makeEpubBuffer([
      { title: 'Ch1', body: 'foo' },
      { title: 'Ch2', body: 'bar' },
    ])
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.meta!.title).toBe('Test Book')
    expect(result.value.meta!.pageCount).toBe(2)
  })

  it('resolves image srcs in chapters to blob: URLs', async () => {
    // Minimal 1×1 PNG
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
      0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
      0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
      0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
      0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
      0x44, 0xAE, 0x42, 0x60, 0x82,
    ])

    const zip = new JSZip()
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Image Book</dc:title></metadata>
      <manifest>
        <item id="ch0" href="text/chapter0.xhtml" media-type="application/xhtml+xml"/>
        <item id="img0" href="images/test.png" media-type="image/png"/>
      </manifest>
      <spine><itemref idref="ch0"/></spine>
    </package>`
    zip.file('OEBPS/content.opf', opf)
    // Chapter references image with relative path ../images/test.png
    zip.file('OEBPS/text/chapter0.xhtml', `<!DOCTYPE html><html><body>
      <p>Text before image</p>
      <img src="../images/test.png" alt="test image"/>
      <p>Text after image</p>
    </body></html>`)
    zip.file('OEBPS/images/test.png', pngBytes)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { blocks } = result.value
    const imgBlock = blocks.find((b: any) => b.type === 'image') as any
    expect(imgBlock).toBeDefined()
    expect(imgBlock?.src).toMatch(/^blob:/)
    expect(imgBlock?.alt).toBe('test image')
  })

  it('handles empty EPUB spine gracefully', async () => {
    const zip = new JSZip()
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Empty Book</dc:title></metadata><manifest></manifest><spine></spine></package>`
    zip.file('OEBPS/content.opf', opf)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.blocks).toHaveLength(0)
  })

  it('parses a code block from pre>code', async () => {
    const zip = new JSZip()
    zip.file('META-INF/container.xml', `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
    const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Code Book</dc:title></metadata><manifest><item id="ch0" href="chapter0.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch0"/></spine></package>`
    zip.file('OEBPS/content.opf', opf)
    zip.file('OEBPS/chapter0.xhtml', `<!DOCTYPE html><html><body>
      <pre><code class="language-javascript">const x = 1;</code></pre>
    </body></html>`)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await epubAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const code = result.value.blocks.find((b: any) => b.type === 'code')
    expect(code).toBeDefined()
    if (code?.type === 'code') {
      expect(code.code).toContain('const x = 1')
      expect(code.language).toBe('javascript')
    }
  })
})
