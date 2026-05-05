import { describe, it, expect } from 'vitest'
import { odpAdapter } from '../../../src/adapters/odp/index'
import JSZip from 'jszip'

async function makeOdpBuffer(slides: Array<{ title: string }>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file('mimetype', 'application/vnd.oasis.opendocument.presentation')
  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:svg="urn:w3.org/2000/svg"
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0">
  <office:body>
    <office:presentation>
      ${slides.map((s, i) => `
      <draw:page draw:name="Slide${i+1}">
        <draw:frame svg:x="1cm" svg:y="1cm" svg:width="20cm" svg:height="3cm">
          <draw:text-box>
            <text:p>${s.title}</text:p>
          </draw:text-box>
        </draw:frame>
      </draw:page>`).join('')}
    </office:presentation>
  </office:body>
</office:document-content>`
  zip.file('content.xml', contentXml)
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('odpAdapter', () => {
  it('parses a single slide with a text shape', async () => {
    const buf    = await makeOdpBuffer([{ title: 'Hello ODP' }])
    const result = await odpAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { blocks, meta } = result.value
    expect(blocks).toHaveLength(1)

    const slide = blocks[0]
    expect(slide.type).toBe('slide')
    if (slide.type !== 'slide') return

    expect(slide.index).toBe(0)
    expect(slide.canvasWidth).toBeGreaterThan(0)
    expect(slide.canvasHeight).toBeGreaterThan(0)
    expect(slide.elements).toHaveLength(1)

    const el = slide.elements[0]
    expect(el?.type).toBe('text')
    if (el?.type !== 'text') return

    const textContent = el.paragraphs.flatMap((p: any) => p.content).map((i: any) => i.text ?? '').join('')
    expect(textContent).toContain('Hello ODP')

    expect(meta.slideCount).toBe(1)
  })

  it('parses multiple slides', async () => {
    const buf = await makeOdpBuffer([
      { title: 'Slide One' },
      { title: 'Slide Two' },
      { title: 'Slide Three' },
    ])
    const result = await odpAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { blocks } = result.value
    expect(blocks).toHaveLength(3)
    expect(blocks[0]!.type).toBe('slide')
    expect(blocks[1]!.type).toBe('slide')
    expect(blocks[2]!.type).toBe('slide')

    if (blocks[0]!.type === 'slide') expect(blocks[0]!.index).toBe(0)
    if (blocks[1]!.type === 'slide') expect(blocks[1]!.index).toBe(1)
    if (blocks[2]!.type === 'slide') expect(blocks[2]!.index).toBe(2)
  })

  it('extracts text from multiple shapes on one slide', async () => {
    const zip = new JSZip()
    zip.file('mimetype', 'application/vnd.oasis.opendocument.presentation')
    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:svg="urn:w3.org/2000/svg"
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0">
  <office:body>
    <office:presentation>
      <draw:page draw:name="Slide1">
        <draw:frame svg:x="1cm" svg:y="1cm" svg:width="20cm" svg:height="3cm">
          <draw:text-box>
            <text:p>Title Text</text:p>
          </draw:text-box>
        </draw:frame>
        <draw:frame svg:x="1cm" svg:y="5cm" svg:width="20cm" svg:height="10cm">
          <draw:text-box>
            <text:p>Body Text</text:p>
          </draw:text-box>
        </draw:frame>
      </draw:page>
    </office:presentation>
  </office:body>
</office:document-content>`
    zip.file('content.xml', contentXml)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await odpAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0]
    expect(slide.type).toBe('slide')
    if (slide.type !== 'slide') return
    expect(slide.elements).toHaveLength(2)
  })

  it('uses default canvas dimensions (4:3) when no page-layout-properties found', async () => {
    const buf    = await makeOdpBuffer([{ title: 'Test' }])
    const result = await odpAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0]
    if (slide.type !== 'slide') return

    // Default 4:3: 25.4cm × 19.05cm in EMU
    expect(slide.canvasWidth).toBe(25.4 * 360000)
    expect(slide.canvasHeight).toBe(19.05 * 360000)
  })

  it('respects AbortSignal before parse', async () => {
    const buf  = await makeOdpBuffer([{ title: 'Never parsed' }])
    const ctrl = new AbortController()
    ctrl.abort()
    const result = await odpAdapter.parse(buf, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  it('respects AbortSignal after ZIP load (pre-aborted signal)', async () => {
    const slides = Array.from({ length: 5 }, (_, i) => ({ title: `Slide ${i + 1}` }))
    const buf    = await makeOdpBuffer(slides)

    // Pre-abort ensures the signal is already aborted when parse() checks it
    const ctrl = new AbortController()
    ctrl.abort()

    const result = await odpAdapter.parse(buf, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  it('returns CORRUPT_FILE for invalid ZIP data', async () => {
    const corrupt = new Uint8Array(512)
    corrupt[0] = 0x50; corrupt[1] = 0x4B; corrupt[2] = 0x03; corrupt[3] = 0x04
    corrupt.fill(0xFF, 4)
    const result = await odpAdapter.parse(corrupt.buffer)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('returns CORRUPT_FILE when content.xml is missing', async () => {
    const zip = new JSZip()
    zip.file('mimetype', 'application/vnd.oasis.opendocument.presentation')
    // Deliberately omit content.xml
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await odpAdapter.parse(buf)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('extracts position and size from text shapes as EMU', async () => {
    const buf    = await makeOdpBuffer([{ title: 'Positioned' }])
    const result = await odpAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0]
    if (slide.type !== 'slide') return
    const el = slide.elements[0]
    if (!el || el.type !== 'text') return

    // svg:x="1cm" → 360000 EMU, svg:y="1cm" → 360000 EMU
    // svg:width="20cm" → 7200000 EMU, svg:height="3cm" → 1080000 EMU
    expect(el.x).toBe(360000)
    expect(el.y).toBe(360000)
    expect(el.width).toBe(7200000)
    expect(el.height).toBe(1080000)
  })

  it('includes slideCount in meta', async () => {
    const buf    = await makeOdpBuffer([{ title: 'A' }, { title: 'B' }])
    const result = await odpAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.meta!.slideCount).toBe(2)
  })

  it('resolves slide background color from automatic-styles in content.xml', async () => {
    const FO    = 'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"'
    const STYLE = 'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
    const DRAW_NS = 'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"'
    const zip = new JSZip()
    zip.file('mimetype', 'application/vnd.oasis.opendocument.presentation')
    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  ${DRAW_NS}
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:svg="urn:w3.org/2000/svg"
  ${FO} ${STYLE}>
  <office:automatic-styles>
    <style:style style:name="dp1" style:family="drawing-page">
      <style:drawing-page-properties draw:fill="solid" draw:fill-color="#123456"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:presentation>
      <draw:page draw:name="Slide1" draw:style-name="dp1">
        <draw:frame svg:x="1cm" svg:y="1cm" svg:width="10cm" svg:height="3cm">
          <draw:text-box><text:p>Hello</text:p></draw:text-box>
        </draw:frame>
      </draw:page>
    </office:presentation>
  </office:body>
</office:document-content>`
    zip.file('content.xml', contentXml)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await odpAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0]
    if (slide.type !== 'slide') return
    expect(slide.background).toBe('#123456')
  })

  it('resolves text style bold/italic/color/fontSize from automatic-styles', async () => {
    const FO    = 'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"'
    const STYLE = 'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"'
    const zip = new JSZip()
    zip.file('mimetype', 'application/vnd.oasis.opendocument.presentation')
    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:svg="urn:w3.org/2000/svg"
  ${FO} ${STYLE}>
  <office:automatic-styles>
    <style:style style:name="BoldRed" style:family="text">
      <style:text-properties fo:font-weight="bold" fo:color="#ff0000" fo:font-size="24pt"/>
    </style:style>
    <style:style style:name="EmStyle" style:family="text">
      <style:text-properties fo:font-style="italic"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:presentation>
      <draw:page draw:name="Slide1">
        <draw:frame svg:x="1cm" svg:y="1cm" svg:width="20cm" svg:height="5cm">
          <draw:text-box>
            <text:p>
              <text:span text:style-name="BoldRed">Bold Red</text:span>
              <text:span text:style-name="EmStyle">Italic</text:span>
            </text:p>
          </draw:text-box>
        </draw:frame>
      </draw:page>
    </office:presentation>
  </office:body>
</office:document-content>`
    zip.file('content.xml', contentXml)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await odpAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0]
    if (slide.type !== 'slide') return
    const el = slide.elements[0]
    if (!el || el.type !== 'text') return

    const inlines = el.paragraphs.flatMap((p: any) => p.content)
    const boldInline = inlines.find((i: any) => i.text === 'Bold Red')
    expect(boldInline).toBeDefined()
    expect(boldInline.bold).toBe(true)
    expect(boldInline.color).toBe('#ff0000')
    expect(boldInline.fontSize).toBe(24)

    const italicInline = inlines.find((i: any) => i.text === 'Italic')
    expect(italicInline).toBeDefined()
    expect(italicInline.italic).toBe(true)
  })

  it('extracts image frame as image SlideElement with blob: URL', async () => {
    // Minimal 1×1 PNG (67 bytes)
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
    zip.file('mimetype', 'application/vnd.oasis.opendocument.presentation')
    zip.file('Pictures/test.png', pngBytes)
    const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:svg="urn:w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0">
  <office:body>
    <office:presentation>
      <draw:page draw:name="Slide1">
        <draw:frame svg:x="2cm" svg:y="2cm" svg:width="10cm" svg:height="8cm">
          <draw:image xlink:href="Pictures/test.png"/>
        </draw:frame>
      </draw:page>
    </office:presentation>
  </office:body>
</office:document-content>`
    zip.file('content.xml', contentXml)
    const buf    = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await odpAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0]
    if (slide.type !== 'slide') return
    expect(slide.elements).toHaveLength(1)

    const imgEl = slide.elements[0]
    expect(imgEl?.type).toBe('image')
    if (imgEl?.type !== 'image') return
    expect(imgEl.src).toMatch(/^blob:/)
    expect(imgEl.x).toBe(2 * 360000)    // 2cm in EMU
    expect(imgEl.y).toBe(2 * 360000)
    expect(imgEl.width).toBe(10 * 360000)
    expect(imgEl.height).toBe(8 * 360000)
  })
})
