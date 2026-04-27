import type JSZip from 'jszip'
import type { SlideElement, SlideParagraph, TextInline } from '../../../core/model/types'
import { qs, parseXml } from '../xml'
import { parseTableShape } from './table'
import type { ThemeColors } from './theme'
import type { RelMap } from './relationships'
import { parseTxBody } from './run'
import { resolvePath, readZipEntry } from '../utils'

const CHART_URI   = 'http://schemas.openxmlformats.org/drawingml/2006/chart'
const DIAGRAM_URI = 'http://schemas.openxmlformats.org/drawingml/2006/diagram'

/**
 * Dispatch a <p:graphicFrame> to the appropriate sub-parser:
 *  - DrawingML chart  → extract title + series names as a text element
 *  - SmartArt diagram → extract node text as a text element
 *  - Otherwise        → fall back to table parsing
 */
export async function parseGraphicFrame(
  graphicFrame: Element,
  canvasW: number,
  canvasH: number,
  themeColors: ThemeColors,
  rels: RelMap,
  zip: JSZip,
  slideZipPath: string,
): Promise<SlideElement | null> {
  const graphicData = qs(graphicFrame, 'graphicData')
  const uri = graphicData?.getAttribute('uri') ?? ''

  if (uri === CHART_URI || uri.endsWith('/chart')) {
    return parseChartFrame(graphicFrame, canvasW, canvasH, themeColors, rels, zip, slideZipPath)
  }

  if (uri === DIAGRAM_URI || uri.endsWith('/diagram')) {
    return parseSmartArtFrame(graphicFrame, canvasW, canvasH, rels, zip, slideZipPath)
  }

  return parseTableShape(graphicFrame, canvasW, canvasH, themeColors)
}

// ─── Chart ───────────────────────────────────────────────────────────────────

async function parseChartFrame(
  graphicFrame: Element,
  canvasW: number,
  canvasH: number,
  themeColors: ThemeColors,
  rels: RelMap,
  zip: JSZip,
  slideZipPath: string,
): Promise<SlideElement | null> {
  const { x, y, width, height } = getFrameGeom(graphicFrame, canvasW, canvasH)

  // Find <c:chart r:id="rId..."/> — may use any namespace prefix
  const chartRef = findByLocalName(graphicFrame, 'chart')
  if (!chartRef) return null

  const rId = getRId(chartRef)
  if (!rId) return null

  const rel = rels.get(rId)
  if (!rel) return null

  const chartPath = resolvePath(slideZipPath, rel.target)
  const chartXml  = await readZipEntry(zip, chartPath)
  if (!chartXml) return null

  const paragraphs: SlideParagraph[] = []

  const chartDoc = parseXml(chartXml)

  // Title: <c:title><c:tx><c:rich><a:txBody>
  const titleEl = findByLocalName(chartDoc, 'title')
  if (titleEl) {
    const txBody = findByLocalName(titleEl, 'txBody')
    if (txBody instanceof Element) {
      const ps = parseTxBody(txBody, themeColors)
      paragraphs.push(...ps)
    } else {
      // Fallback: <c:title><c:tx><c:v> plain text
      const v = findByLocalName(titleEl, 'v')
      if (v?.textContent?.trim()) {
        paragraphs.push({
          content: [{ type: 'text', text: v.textContent.trim(), bold: true } as TextInline],
        })
      }
    }
  }

  // Series names: <c:ser><c:tx> → <c:strRef><c:v> or <c:v>
  for (const ser of qsAllByLocalName(chartDoc, 'ser')) {
    const txEl = findByLocalName(ser, 'tx')
    if (!txEl) continue
    const v = findByLocalName(txEl, 'v')
    const name = v?.textContent?.trim()
    if (name) {
      paragraphs.push({ content: [{ type: 'text', text: name } as TextInline] })
    }
  }

  if (paragraphs.length === 0) return null
  return { type: 'text', x, y, width, height, paragraphs }
}

// ─── SmartArt ────────────────────────────────────────────────────────────────

async function parseSmartArtFrame(
  graphicFrame: Element,
  canvasW: number,
  canvasH: number,
  rels: RelMap,
  zip: JSZip,
  slideZipPath: string,
): Promise<SlideElement | null> {
  const { x, y, width, height } = getFrameGeom(graphicFrame, canvasW, canvasH)

  // <dgm:relIds r:dm="rId..."/> — data model relationship
  const relIds = findByLocalName(graphicFrame, 'relIds')
  if (!relIds) return null

  const rId =
    relIds.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'dm') ??
    relIds.getAttribute('r:dm')
  if (!rId) return null

  const rel = rels.get(rId)
  if (!rel) return null

  const dataPath = resolvePath(slideZipPath, rel.target)
  const dataXml  = await readZipEntry(zip, dataPath)
  if (!dataXml) return null

  const dataDoc = parseXml(dataXml)

  const paragraphs: SlideParagraph[] = []

  for (const pt of qsAllByLocalName(dataDoc, 'pt')) {
    const typeAttr = pt.getAttribute('type')
    // Only 'node' and 'asst' (assistant) types carry user text
    if (typeAttr !== 'node' && typeAttr !== 'asst' && typeAttr !== null) continue
    const t = findByLocalName(pt, 't')
    const text = t?.textContent?.trim()
    if (text) {
      paragraphs.push({ content: [{ type: 'text', text } as TextInline] })
    }
  }

  if (paragraphs.length === 0) return null
  return { type: 'text', x, y, width, height, paragraphs }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFrameGeom(
  graphicFrame: Element,
  canvasW: number,
  canvasH: number,
): { x: number; y: number; width: number; height: number } {
  let x = 0, y = 0, width = canvasW, height = canvasH
  const xfrm = qs(graphicFrame, 'xfrm')
  if (xfrm) {
    const off = qs(xfrm, 'off')
    const ext = qs(xfrm, 'ext')
    if (off) {
      x = parseInt(off.getAttribute('x') ?? '0', 10) || 0
      y = parseInt(off.getAttribute('y') ?? '0', 10) || 0
    }
    if (ext) {
      const w = parseInt(ext.getAttribute('cx') ?? '0', 10)
      const h = parseInt(ext.getAttribute('cy') ?? '0', 10)
      if (w > 0) width  = w
      if (h > 0) height = h
    }
  }
  return { x, y, width, height }
}

function getRId(el: Element): string | null {
  return (
    el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ??
    el.getAttribute('r:id') ??
    el.getAttribute('id') ??
    null
  )
}

/** Find first descendant (or self) with given localName, regardless of namespace. */
function findByLocalName(root: Document | Element, localName: string): Element | null {
  const iter = root.ownerDocument
    ? root.ownerDocument.createNodeIterator(root, 0x1)
    : (root as unknown as Document).createNodeIterator(root, 0x1)
  let node = iter.nextNode()
  while (node) {
    if ((node as Element).localName === localName) return node as Element
    node = iter.nextNode()
  }
  return null
}

function qsAllByLocalName(root: Document | Element, localName: string): Element[] {
  const all: Element[] = []
  // Use getElementsByTagName with wildcard and filter
  const source = root instanceof Document ? root.documentElement : root
  if (!source) return all
  const walker = source.ownerDocument
    ? source.ownerDocument.createTreeWalker(source, 0x1)
    : (source.getRootNode() as Document).createTreeWalker(source, 0x1)
  let node = walker.nextNode()
  while (node) {
    if ((node as Element).localName === localName) all.push(node as Element)
    node = walker.nextNode()
  }
  return all
}

