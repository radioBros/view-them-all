import type { SlideElement } from '../../../core/model/types'
import { qs } from '../xml'
import { parseTxBody } from './run'
import type { PlaceholderMap } from './layout'
import { getMasterDefaultFontSize, getMasterDefaultTextColor } from './layout'
import type { ThemeColors } from './theme'
import { resolveColorEl } from './theme'
import type { RelMap } from './relationships'

/**
 * Parse a <p:sp> text shape element into a SlideElement.
 *
 * Geometry resolution order:
 *  1. <p:spPr><a:xfrm> from the slide itself
 *  2. Layout + master placeholder maps (keyed by idx then type)
 *  3. Full-canvas fallback
 */
export function parseTextShape(
  sp: Element,
  canvasW: number,
  canvasH: number,
  layoutPlaceholders: PlaceholderMap = new Map(),
  themeColors: ThemeColors = new Map(),
  rels: RelMap = new Map(),
  masterPlaceholders: PlaceholderMap = new Map(),
  masterDoc: Document | null = null,
): SlideElement | null {
  let x = 0, y = 0, width = canvasW, height = canvasH
  let hasGeom = false

  const xfrm = qs(sp, 'xfrm')
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
      if (w > 0 && h > 0) {
        width   = w
        height  = h
        hasGeom = true
      }
    }
  }

  // Inherit geometry from layout → master placeholders when slide has none
  if (!hasGeom) {
    const ph = qs(sp, 'ph')
    if (ph) {
      const idx  = ph.getAttribute('idx')
      const type = ph.getAttribute('type') ?? 'body'

      const geom =
        (idx !== null ? layoutPlaceholders.get(idx) : undefined) ??
        layoutPlaceholders.get(type) ??
        (idx !== null ? masterPlaceholders.get(idx) : undefined) ??
        masterPlaceholders.get(type)

      if (geom) {
        x      = geom.x
        y      = geom.y
        width  = geom.width
        height = geom.height
      }
    }
  }

  const txBody = qs(sp, 'txBody')
  if (!txBody) return null

  // Determine placeholder type for txStyles default font size lookup
  const ph = qs(sp, 'ph')
  const phType = ph?.getAttribute('type') ?? (ph ? 'body' : '')
  const defaultFontSizePt = phType ? getMasterDefaultFontSize(masterDoc, phType) : undefined
  const defaultColor      = phType ? getMasterDefaultTextColor(masterDoc, phType, themeColors) : undefined

  const paragraphs = parseTxBody(txBody, themeColors, rels, defaultFontSizePt, defaultColor)
  if (paragraphs.length === 0) return null

  // Shape fill color from <p:spPr><a:solidFill>
  let backgroundColor: string | undefined
  const spPr = qs(sp, 'spPr')
  if (spPr) {
    const solidFill = qs(spPr, 'solidFill')
    if (solidFill) backgroundColor = resolveColorEl(solidFill, themeColors)
  }

  // Vertical text alignment from <a:bodyPr anchor="...">
  let verticalAlign: 'top' | 'middle' | 'bottom' | undefined
  const bodyPr = qs(txBody, 'bodyPr')
  if (bodyPr) {
    const anchor = bodyPr.getAttribute('anchor')
    if (anchor === 'ctr')  verticalAlign = 'middle'
    else if (anchor === 'b') verticalAlign = 'bottom'
  }

  return {
    type: 'text',
    x,
    y,
    width,
    height,
    paragraphs,
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(verticalAlign   ? { verticalAlign }   : {}),
  }
}
