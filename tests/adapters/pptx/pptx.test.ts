import { describe, it, expect } from 'vitest'
import { pptxAdapter } from '../../../src/adapters/pptx/index'
import { getMasterDefaultFontSize } from '../../../src/adapters/pptx/parser/layout'
import JSZip from 'jszip'

// ─── Namespace shortcuts ──────────────────────────────────────────────────────

const NS_RELS    = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"'
const NS_PRES    = [
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ')
const NS_SLIDE   = [
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
].join(' ')
const NS_CORE    = [
  'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
].join(' ')

// ─── Slide XML builder ────────────────────────────────────────────────────────

/**
 * Build minimal slide XML with an optional text title shape.
 * All coordinates/sizes are in EMU.
 */
function buildSlideXml(title: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld ${NS_SLIDE}>
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:spPr>
          <a:xfrm>
            <a:off x="457200" y="274638"/>
            <a:ext cx="8229600" cy="1143000"/>
          </a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p>
            <a:r>
              <a:t>${title}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`
}

/**
 * Build minimal notesSlide XML with body text.
 */
function buildNotesXml(notes: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes ${NS_SLIDE}>
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr>
          <p:nvPr><p:ph type="body"/></p:nvPr>
        </p:nvSpPr>
        <p:txBody>
          <a:bodyPr/>
          <a:p>
            <a:r>
              <a:t>${notes}</a:t>
            </a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:notes>`
}

// ─── PPTX fixture builder ─────────────────────────────────────────────────────

interface SlideSpec {
  title: string
  notes?: string
}

async function makePptx(
  slides: SlideSpec[],
  canvasWidth  = 9144000,
  canvasHeight = 5143500
): Promise<File> {
  const zip = new JSZip()

  // [Content_Types].xml
  const overrides = slides.map((_, i) =>
    `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
  ).join('\n  ')

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml"  ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${overrides}
</Types>`)

  // _rels/.rels
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${NS_RELS}>
  <Relationship Id="rId1"
    Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
    Target="ppt/presentation.xml"/>
</Relationships>`)

  // Build sldIdLst and ppt/_rels/presentation.xml.rels entries
  const sldIdEntries = slides.map((_, i) =>
    `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`
  ).join('\n    ')

  const presRelEntries = slides.map((_, i) =>
    `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`
  ).join('\n  ')

  // ppt/presentation.xml
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation ${NS_PRES}>
  <p:sldSz cx="${canvasWidth}" cy="${canvasHeight}" type="screen4x3"/>
  <p:sldIdLst>
    ${sldIdEntries}
  </p:sldIdLst>
</p:presentation>`)

  // ppt/_rels/presentation.xml.rels
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${NS_RELS}>
  ${presRelEntries}
</Relationships>`)

  // Individual slide files
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]!
    const slideFile = `ppt/slides/slide${i + 1}.xml`
    const relsFile  = `ppt/slides/_rels/slide${i + 1}.xml.rels`

    zip.file(slideFile, buildSlideXml(slide.title))

    if (slide.notes) {
      const notesFile    = `ppt/notesSlides/notesSlide${i + 1}.xml`
      const notesRelType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide'

      zip.file(notesFile, buildNotesXml(slide.notes))

      zip.file(relsFile, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${NS_RELS}>
  <Relationship Id="rId1" Type="${notesRelType}" Target="../notesSlides/notesSlide${i + 1}.xml"/>
</Relationships>`)
    } else {
      zip.file(relsFile, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships ${NS_RELS}>
</Relationships>`)
    }
  }

  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  return new File([buf], 'test.pptx', {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pptxAdapter', () => {
  // 1. Single-slide PPTX → one SlideBlock
  it('parses a single-slide PPTX and returns one SlideBlock', async () => {
    const file   = await makePptx([{ title: 'Hello World' }])
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { blocks } = result.value
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('slide')
  })

  // 2. Multi-slide PPTX → multiple SlideBlocks in order
  it('parses a multi-slide PPTX and returns blocks in order', async () => {
    const file   = await makePptx([
      { title: 'Slide One' },
      { title: 'Slide Two' },
      { title: 'Slide Three' },
    ])
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const { blocks } = result.value
    expect(blocks).toHaveLength(3)
    expect(blocks[0].type).toBe('slide')
    expect(blocks[1].type).toBe('slide')
    expect(blocks[2].type).toBe('slide')
  })

  // 3. SlideBlock has correct index, canvasWidth, canvasHeight
  it('sets correct index, canvasWidth, canvasHeight on each SlideBlock', async () => {
    const cx = 9144000
    const cy = 5143500
    const file   = await makePptx(
      [{ title: 'A' }, { title: 'B' }],
      cx,
      cy
    )
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const [s0, s1] = result.value.blocks as any[]
    expect(s0.index).toBe(0)
    expect(s0.canvasWidth).toBe(cx)
    expect(s0.canvasHeight).toBe(cy)

    expect(s1.index).toBe(1)
    expect(s1.canvasWidth).toBe(cx)
    expect(s1.canvasHeight).toBe(cy)
  })

  // 4. Text shapes have correct content
  it('parses text shape content correctly', async () => {
    const file   = await makePptx([{ title: 'My Title Text' }])
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0] as any
    expect(slide.elements).toHaveLength(1)

    const textEl = slide.elements[0]
    expect(textEl.type).toBe('text')
    expect(textEl.paragraphs).toBeDefined()
    expect(textEl.paragraphs.length).toBeGreaterThan(0)
    expect(textEl.paragraphs[0].content[0].text).toBe('My Title Text')
  })

  // 5. Speaker notes are included
  it('includes speaker notes when present', async () => {
    const file   = await makePptx([{ title: 'Slide With Notes', notes: 'These are my notes' }])
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0] as any
    expect(slide.notes).toBeDefined()
    expect(slide.notes).toContain('These are my notes')
  })

  // 5b. Slides without notes have undefined notes
  it('does not include notes field when slide has no notes', async () => {
    const file   = await makePptx([{ title: 'No Notes' }])
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0] as any
    expect(slide.notes).toBeUndefined()
  })

  // 6. AbortSignal respected — aborted before parse
  it('respects AbortSignal aborted before parse', async () => {
    const file = await makePptx([{ title: 'Abort Test' }])
    const ctrl = new AbortController()
    ctrl.abort()

    const result = await pptxAdapter.parse(file, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  // 7. Corrupt file → CORRUPT_FILE error
  it('returns CORRUPT_FILE for a corrupt input', async () => {
    // ZIP magic bytes + garbage data (per project convention)
    const corrupt = new Uint8Array(512)
    corrupt[0] = 0x50; corrupt[1] = 0x4B; corrupt[2] = 0x03; corrupt[3] = 0x04
    corrupt.fill(0xFF, 4)

    const file   = new File([corrupt], 'bad.pptx')
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  // Additional: meta.slideCount is set correctly
  it('sets meta.slideCount to the number of slides', async () => {
    const file   = await makePptx([{ title: 'A' }, { title: 'B' }, { title: 'C' }])
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.meta.slideCount).toBe(3)
  })

  // Additional: SlideElement x/y/width/height are set from xfrm
  it('parses slide element position and size from xfrm', async () => {
    const file   = await makePptx([{ title: 'Position Test' }])
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0] as any
    const el = slide.elements[0]
    // Values from buildSlideXml: off x="457200" y="274638", ext cx="8229600" cy="1143000"
    expect(el.x).toBe(457200)
    expect(el.y).toBe(274638)
    expect(el.width).toBe(8229600)
    expect(el.height).toBe(1143000)
  })

  // Chart: graphicFrame with chart namespace extracts title text
  it('extracts chart title from a graphicFrame with chart namespace', async () => {
    const NS_C = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"'
    const CHART_URI = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
    const REL_NS_VAL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

    const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld ${NS_SLIDE}>
  <p:cSld>
    <p:spTree>
      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="2" name="Chart 1"/>
          <p:cNvGraphicFramePr/>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm>
          <a:off x="500000" y="500000"/>
          <a:ext cx="5000000" cy="3000000"/>
        </p:xfrm>
        <a:graphic>
          <a:graphicData uri="${CHART_URI}">
            <c:chart r:id="rId1" ${NS_C}
              xmlns:r="${REL_NS_VAL}"/>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>
    </p:spTree>
  </p:cSld>
</p:sld>`

    const chartXml = `<?xml version="1.0" encoding="UTF-8"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
              xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <c:chart>
    <c:title>
      <c:tx>
        <c:rich>
          <a:txBody>
            <a:p><a:r><a:t>My Chart Title</a:t></a:r></a:p>
          </a:txBody>
        </c:rich>
      </c:tx>
    </c:title>
  </c:chart>
</c:chartSpace>`

    const chartRelType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'
    const slideRelsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships ${NS_RELS}>
  <Relationship Id="rId1" Type="${chartRelType}" Target="../charts/chart1.xml"/>
</Relationships>`

    const zip = new JSZip()
    zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`)
    zip.file('_rels/.rels', `<?xml version="1.0"?><Relationships ${NS_RELS}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`)
    zip.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation ${NS_PRES}><p:sldSz cx="9144000" cy="5143500"/><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`)
    zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0"?><Relationships ${NS_RELS}><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`)
    zip.file('ppt/slides/slide1.xml', slideXml)
    zip.file('ppt/slides/_rels/slide1.xml.rels', slideRelsXml)
    zip.file('ppt/charts/chart1.xml', chartXml)

    const buf  = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([buf], 'chart.pptx')
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0] as any
    expect(slide.type).toBe('slide')
    const el = slide.elements[0]
    expect(el).toBeDefined()
    expect(el.type).toBe('text')
    const text = el.paragraphs.flatMap((p: any) => p.content).map((i: any) => i.text ?? '').join('')
    expect(text).toContain('My Chart Title')
  })

  // SmartArt: graphicFrame with diagram namespace extracts node text
  it('extracts SmartArt node text from a graphicFrame with diagram namespace', async () => {
    const DIAGRAM_URI = 'http://schemas.openxmlformats.org/drawingml/2006/diagram'
    const REL_NS_VAL  = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    const DGM_NS      = 'xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram"'

    const slideXml = `<?xml version="1.0" encoding="UTF-8"?>
<p:sld ${NS_SLIDE}>
  <p:cSld>
    <p:spTree>
      <p:graphicFrame>
        <p:nvGraphicFramePr>
          <p:cNvPr id="3" name="SmartArt 1"/>
          <p:cNvGraphicFramePr/>
          <p:nvPr/>
        </p:nvGraphicFramePr>
        <p:xfrm>
          <a:off x="500000" y="500000"/>
          <a:ext cx="5000000" cy="3000000"/>
        </p:xfrm>
        <a:graphic>
          <a:graphicData uri="${DIAGRAM_URI}">
            <dgm:relIds r:dm="rId1" ${DGM_NS}
              xmlns:r="${REL_NS_VAL}"/>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>
    </p:spTree>
  </p:cSld>
</p:sld>`

    const diagramDataXml = `<?xml version="1.0" encoding="UTF-8"?>
<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram">
  <dgm:ptLst>
    <dgm:pt type="doc" modelId="{1}"/>
    <dgm:pt type="node" modelId="{2}">
      <dgm:t>Alpha Node</dgm:t>
    </dgm:pt>
    <dgm:pt type="node" modelId="{3}">
      <dgm:t>Beta Node</dgm:t>
    </dgm:pt>
  </dgm:ptLst>
</dgm:dataModel>`

    const diagramRelType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData'
    const slideRelsXml = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships ${NS_RELS}>
  <Relationship Id="rId1" Type="${diagramRelType}" Target="../diagrams/data1.xml"/>
</Relationships>`

    const zip = new JSZip()
    zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`)
    zip.file('_rels/.rels', `<?xml version="1.0"?><Relationships ${NS_RELS}><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`)
    zip.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation ${NS_PRES}><p:sldSz cx="9144000" cy="5143500"/><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`)
    zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0"?><Relationships ${NS_RELS}><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`)
    zip.file('ppt/slides/slide1.xml', slideXml)
    zip.file('ppt/slides/_rels/slide1.xml.rels', slideRelsXml)
    zip.file('ppt/diagrams/data1.xml', diagramDataXml)

    const buf  = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([buf], 'smartart.pptx')
    const result = await pptxAdapter.parse(file)

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const slide = result.value.blocks[0] as any
    expect(slide.type).toBe('slide')
    const el = slide.elements[0]
    expect(el).toBeDefined()
    expect(el.type).toBe('text')
    const texts = el.paragraphs.map((p: any) => p.content.map((i: any) => i.text ?? '').join(''))
    expect(texts.some((t: string) => t.includes('Alpha Node'))).toBe(true)
    expect(texts.some((t: string) => t.includes('Beta Node'))).toBe(true)
  })
})

// ─── Unit tests for layout helpers ───────────────────────────────────────────

describe('getMasterDefaultFontSize', () => {
  const NS_P = 'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
  const NS_A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'

  function parseMasterXml(xml: string): Document {
    return new DOMParser().parseFromString(xml, 'application/xml')
  }

  it('returns undefined when masterDoc is null', () => {
    expect(getMasterDefaultFontSize(null, 'title')).toBeUndefined()
  })

  it('extracts title font size from titleStyle', () => {
    const doc = parseMasterXml(`<?xml version="1.0"?>
<p:sldMaster ${NS_P} ${NS_A}>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr>
        <a:defRPr sz="4400"/>
      </a:lvl1pPr>
    </p:titleStyle>
    <p:bodyStyle>
      <a:lvl1pPr>
        <a:defRPr sz="2800"/>
      </a:lvl1pPr>
    </p:bodyStyle>
    <p:otherStyle>
      <a:lvl1pPr>
        <a:defRPr sz="1800"/>
      </a:lvl1pPr>
    </p:otherStyle>
  </p:txStyles>
</p:sldMaster>`)
    expect(getMasterDefaultFontSize(doc, 'title')).toBe(44)
    expect(getMasterDefaultFontSize(doc, 'ctrTitle')).toBe(44)
  })

  it('extracts body font size from bodyStyle', () => {
    const doc = parseMasterXml(`<?xml version="1.0"?>
<p:sldMaster ${NS_P} ${NS_A}>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr>
    </p:titleStyle>
    <p:bodyStyle>
      <a:lvl1pPr><a:defRPr sz="2800"/></a:lvl1pPr>
    </p:bodyStyle>
    <p:otherStyle>
      <a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr>
    </p:otherStyle>
  </p:txStyles>
</p:sldMaster>`)
    expect(getMasterDefaultFontSize(doc, 'body')).toBe(28)
    expect(getMasterDefaultFontSize(doc, 'subTitle')).toBe(28)
  })

  it('returns undefined when txStyles is absent', () => {
    const doc = parseMasterXml(`<?xml version="1.0"?>
<p:sldMaster ${NS_P} ${NS_A}>
</p:sldMaster>`)
    expect(getMasterDefaultFontSize(doc, 'title')).toBeUndefined()
  })

  it('returns undefined when sz attribute is missing', () => {
    const doc = parseMasterXml(`<?xml version="1.0"?>
<p:sldMaster ${NS_P} ${NS_A}>
  <p:txStyles>
    <p:titleStyle>
      <a:lvl1pPr><a:defRPr/></a:lvl1pPr>
    </p:titleStyle>
  </p:txStyles>
</p:sldMaster>`)
    expect(getMasterDefaultFontSize(doc, 'title')).toBeUndefined()
  })
})
