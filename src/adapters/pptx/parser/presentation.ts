import { parseXml, qs, qsAll } from '../xml'
import { REL_NS } from '../xml'

// Default EMU dimensions: 10 inches × 5.625 inches (16:9 widescreen)
const DEFAULT_WIDTH  = 9144000
const DEFAULT_HEIGHT = 5143500

export type PresentationInfo = {
  canvasWidth: number
  canvasHeight: number
  slideRIds: string[]
}

/**
 * Parse ppt/presentation.xml to extract slide canvas size and ordered slide rIds.
 */
export function parsePresentation(xmlText: string): PresentationInfo {
  try {
    const doc = parseXml(xmlText)

    // Canvas size
    const sldSz = qs(doc, 'sldSz')
    const canvasWidth  = sldSz ? (parseInt(sldSz.getAttribute('cx') ?? '0', 10) || DEFAULT_WIDTH)  : DEFAULT_WIDTH
    const canvasHeight = sldSz ? (parseInt(sldSz.getAttribute('cy') ?? '0', 10) || DEFAULT_HEIGHT) : DEFAULT_HEIGHT

    // Slide rIds from <p:sldIdLst><p:sldId r:id="rId2"/...>
    const sldIds = qsAll(doc, 'sldId')
    const slideRIds = sldIds.map(el => {
      return (
        el.getAttribute('r:id') ??
        el.getAttributeNS(REL_NS, 'id') ??
        ''
      )
    }).filter(Boolean)

    return { canvasWidth, canvasHeight, slideRIds }
  } catch {
    return { canvasWidth: DEFAULT_WIDTH, canvasHeight: DEFAULT_HEIGHT, slideRIds: [] }
  }
}
