import { parseXml, qs, qsAll } from '../xml'
import type { ThemeColors } from './theme'
import { resolveColorEl } from './theme'

export type PlaceholderGeom = {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Keyed by idx (string) first, then by type ("title", "body", etc.).
 * idx is the canonical unique key; type is a fallback.
 */
export type PlaceholderMap = Map<string, PlaceholderGeom>

/**
 * Extract the default font size (in points) for a given placeholder type from
 * <p:txStyles> in a slide master document.
 *
 * phType: 'title' | 'ctrTitle' | 'body' | 'subTitle' | anything else
 * Returns undefined when not found or master is absent.
 */
export function getMasterDefaultFontSize(masterDoc: Document | null, phType: string): number | undefined {
  if (!masterDoc) return undefined
  const txStyles = qs(masterDoc, 'txStyles')
  if (!txStyles) return undefined

  let container: Element | null = null
  if (phType === 'title' || phType === 'ctrTitle') {
    container = qs(txStyles, 'titleStyle')
  } else if (phType === 'body' || phType === 'subTitle') {
    container = qs(txStyles, 'bodyStyle')
  } else {
    container = qs(txStyles, 'otherStyle')
  }
  if (!container) return undefined

  const lvl1pPr = qs(container, 'lvl1pPr')
  if (!lvl1pPr) return undefined
  const defRPr = qs(lvl1pPr, 'defRPr')
  if (!defRPr) return undefined

  const sz = defRPr.getAttribute('sz')
  if (!sz) return undefined
  const pt = parseInt(sz, 10) / 100
  return pt > 0 ? pt : undefined
}

export function getMasterDefaultTextColor(
  masterDoc: Document | null,
  phType: string,
  themeColors: ThemeColors,
): string | undefined {
  if (!masterDoc) return undefined
  const txStyles = qs(masterDoc, 'txStyles')
  if (!txStyles) return undefined

  let container: Element | null = null
  if (phType === 'title' || phType === 'ctrTitle') {
    container = qs(txStyles, 'titleStyle')
  } else if (phType === 'body' || phType === 'subTitle') {
    container = qs(txStyles, 'bodyStyle')
  } else {
    container = qs(txStyles, 'otherStyle')
  }
  if (!container) return undefined

  const lvl1pPr = qs(container, 'lvl1pPr')
  if (!lvl1pPr) return undefined
  const defRPr = qs(lvl1pPr, 'defRPr')
  if (!defRPr) return undefined

  const solidFill = qs(defRPr, 'solidFill')
  if (!solidFill) return undefined
  return resolveColorEl(solidFill, themeColors)
}

export function parseLayoutPlaceholders(layoutXml: string): PlaceholderMap {
  const map: PlaceholderMap = new Map()
  try {
    const doc = parseXml(layoutXml)
    for (const sp of qsAll(doc, 'sp')) {
      const ph = qs(sp, 'ph')
      if (!ph) continue

      const type = ph.getAttribute('type') ?? 'body'
      const idx  = ph.getAttribute('idx')

      const xfrm = qs(sp, 'xfrm')
      if (!xfrm) continue

      const off = qs(xfrm, 'off')
      const ext = qs(xfrm, 'ext')
      if (!off || !ext) continue

      const x      = parseInt(off.getAttribute('x')  ?? '0', 10) || 0
      const y      = parseInt(off.getAttribute('y')  ?? '0', 10) || 0
      const width  = parseInt(ext.getAttribute('cx') ?? '0', 10) || 0
      const height = parseInt(ext.getAttribute('cy') ?? '0', 10) || 0

      if (width <= 0 || height <= 0) continue

      const geom: PlaceholderGeom = { x, y, width, height }

      // idx is the unique key — always store it
      if (idx !== null) map.set(idx, geom)
      // type is a fallback (don't overwrite if type already set by a prior idx)
      if (!map.has(type)) map.set(type, geom)
    }
  } catch {
    // Return partial/empty map on error
  }
  return map
}
