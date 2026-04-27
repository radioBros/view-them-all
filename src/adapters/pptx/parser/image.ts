import type JSZip from 'jszip'
import type { SlideElement } from '../../../core/model/types'
import type { RelMap } from './relationships'
import { qs, REL_NS } from '../xml'
import { getMimeType } from '../../../shared/mime'

// Formats browsers cannot render natively — skip them silently
const UNRENDERABLE = new Set(['emf', 'wmf', 'eps', 'tif', 'tiff'])

/**
 * Resolve a relationship target relative to ppt/slides/ into a full zip path.
 * Handles ../relative, ./relative, absolute /ppt/ paths, and bare names.
 */
export function resolveFromSlide(target: string): string {
  if (target.startsWith('/')) {
    // Absolute OPC path — strip leading slash
    return target.slice(1)
  }
  if (target.startsWith('../')) {
    return 'ppt/' + target.slice(3)
  }
  if (target.startsWith('./')) {
    return 'ppt/slides/' + target.slice(2)
  }
  // Already full path (some tools write "ppt/media/...")
  if (target.startsWith('ppt/')) return target
  return 'ppt/slides/' + target
}

/**
 * Read the rId from a <a:blip> element.
 * getAttributeNS is the spec-correct approach; getAttribute('r:embed') is a fallback
 * for parsers that store the qualified name literally.
 */
function getBlipRId(blip: Element): string | null {
  return (
    blip.getAttributeNS(REL_NS, 'embed') ??
    blip.getAttribute('r:embed') ??
    null
  )
}

/**
 * Parse a <p:pic> image shape element into a SlideElement.
 * Returns null only if the image data cannot be loaded from the ZIP.
 */
export async function parseImageShape(
  pic: Element,
  canvasW: number,
  canvasH: number,
  zip: JSZip,
  rels: RelMap
): Promise<SlideElement | null> {
  const blip = qs(pic, 'blip')
  if (!blip) return null

  const rId = getBlipRId(blip)
  if (!rId) return null

  const rel = rels.get(rId)
  if (!rel) return null

  const zipPath = resolveFromSlide(rel.target)

  // Skip vector/metafile formats browsers can't render
  const ext = zipPath.split('.').pop()?.toLowerCase() ?? ''
  if (UNRENDERABLE.has(ext)) return null

  // Position and size from xfrm — fall back to full canvas if missing
  let x = 0, y = 0, width = canvasW, height = canvasH

  const xfrm = qs(pic, 'xfrm')
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

  try {
    const data = await zip.file(zipPath)?.async('arraybuffer')
    if (!data) return null

    const mime = getMimeType(zipPath)
    const blob = new Blob([data], { type: mime })
    const src  = URL.createObjectURL(blob)

    return { type: 'image', x, y, width, height, src }
  } catch {
    return null
  }
}
