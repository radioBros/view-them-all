import type JSZip from 'jszip'
import type { SlideBlock, SlideElement } from '../../../core/model/types'
import { parseXml, qs } from '../xml'
import type { RelMap } from './relationships'
import { parseRelationships } from './relationships'
import { parseTextShape } from './shape'
import { parseImageShape } from './image'
import { parseGraphicFrame } from './graphic'
import { parseNotes } from './notes'
import type { ThemeColors } from './theme'
import { resolveColorEl } from './theme'
import type { PlaceholderMap } from './layout'

export async function parseSlide(
  slideXml: string,
  relsXml: string,
  notesXml: string | null,
  index: number,
  canvasWidth: number,
  canvasHeight: number,
  zip: JSZip,
  layoutDoc: Document | null = null,
  masterDoc: Document | null = null,
  themeColors: ThemeColors = new Map(),
  layoutPlaceholders: PlaceholderMap = new Map(),
  masterPlaceholders: PlaceholderMap = new Map(),
  slideZipPath: string = '',
): Promise<SlideBlock> {
  const slideRels = parseRelationships(relsXml)
  const doc       = parseXml(slideXml)

  const background = resolveBackground(doc, layoutDoc, masterDoc, themeColors)
  const elements: SlideElement[] = []

  // Walk <p:spTree> children in document order to preserve z-layering.
  const spTree = qs(doc, 'spTree')
  const treeChildren = spTree ? Array.from(spTree.children) : []

  for (const child of treeChildren) {
    const ln = child.localName

    if (ln === 'sp') {
      const el = parseTextShape(child, canvasWidth, canvasHeight, layoutPlaceholders, themeColors, slideRels, masterPlaceholders, masterDoc)
      if (el) elements.push(el)

    } else if (ln === 'graphicFrame') {
      const el = await parseGraphicFrame(child, canvasWidth, canvasHeight, themeColors, slideRels, zip, slideZipPath)
      if (el) elements.push(el)

    } else if (ln === 'pic') {
      const el = await parseImageShape(child, canvasWidth, canvasHeight, zip, slideRels)
      if (el) elements.push(el)

    } else if (ln === 'grpSp') {
      const grpEls = await parseGroupShape(child, canvasWidth, canvasHeight, layoutPlaceholders, masterPlaceholders, themeColors, slideRels, zip, masterDoc, slideZipPath)
      elements.push(...grpEls)
    }
  }

  const notes = notesXml ? parseNotes(notesXml) || undefined : undefined

  const block: SlideBlock = {
    type: 'slide',
    index,
    canvasWidth,
    canvasHeight,
    elements,
    notes,
  }
  if (background) block.background = background
  return block
}

// ─── Group shape processing with proper transform ────────────────────────────

type GroupTransform = {
  offX: number; offY: number
  scaleX: number; scaleY: number
  chOffX: number; chOffY: number
}

async function parseGroupShape(
  grpSp: Element,
  canvasW: number,
  canvasH: number,
  layoutPlaceholders: PlaceholderMap,
  masterPlaceholders: PlaceholderMap,
  themeColors: ThemeColors,
  rels: RelMap,
  zip: JSZip,
  masterDoc: Document | null = null,
  slideZipPath: string = '',
): Promise<SlideElement[]> {
  const elements: SlideElement[] = []

  const grpXfm = parseGroupTransform(grpSp)

  for (const child of Array.from(grpSp.children)) {
    const ln = child.localName
    let el: SlideElement | null = null

    if (ln === 'sp') {
      el = parseTextShape(child, canvasW, canvasH, layoutPlaceholders, themeColors, rels, masterPlaceholders, masterDoc)
    } else if (ln === 'pic') {
      el = await parseImageShape(child, canvasW, canvasH, zip, rels)
    } else if (ln === 'graphicFrame') {
      el = await parseGraphicFrame(child, canvasW, canvasH, themeColors, rels, zip, slideZipPath)
    } else if (ln === 'grpSp') {
      // Recurse for nested groups
      const nested = await parseGroupShape(child, canvasW, canvasH, layoutPlaceholders, masterPlaceholders, themeColors, rels, zip, masterDoc, slideZipPath)
      if (grpXfm) {
        for (const n of nested) elements.push(applyTransform(n, grpXfm))
      } else {
        elements.push(...nested)
      }
      continue
    }

    if (el) {
      elements.push(grpXfm ? applyTransform(el, grpXfm) : el)
    }
  }

  return elements
}

function parseGroupTransform(grpSp: Element): GroupTransform | null {
  const grpSpPr = qs(grpSp, 'grpSpPr')
  if (!grpSpPr) return null
  const xfrm = qs(grpSpPr, 'xfrm')
  if (!xfrm) return null

  const off   = qs(xfrm, 'off')
  const ext   = qs(xfrm, 'ext')
  const chOff = qs(xfrm, 'chOff')
  const chExt = qs(xfrm, 'chExt')
  if (!off || !ext || !chOff || !chExt) return null

  const grpCx  = parseInt(ext.getAttribute('cx')   ?? '0', 10) || 0
  const grpCy  = parseInt(ext.getAttribute('cy')   ?? '0', 10) || 0
  const chCx   = parseInt(chExt.getAttribute('cx') ?? '0', 10) || 0
  const chCy   = parseInt(chExt.getAttribute('cy') ?? '0', 10) || 0

  if (chCx === 0 || chCy === 0) return null

  return {
    offX:   parseInt(off.getAttribute('x')   ?? '0', 10) || 0,
    offY:   parseInt(off.getAttribute('y')   ?? '0', 10) || 0,
    scaleX: grpCx / chCx,
    scaleY: grpCy / chCy,
    chOffX: parseInt(chOff.getAttribute('x') ?? '0', 10) || 0,
    chOffY: parseInt(chOff.getAttribute('y') ?? '0', 10) || 0,
  }
}

function applyTransform(el: SlideElement, t: GroupTransform): SlideElement {
  return {
    ...el,
    x:      Math.round(t.offX + (el.x      - t.chOffX) * t.scaleX),
    y:      Math.round(t.offY + (el.y      - t.chOffY) * t.scaleY),
    width:  Math.round(el.width  * t.scaleX),
    height: Math.round(el.height * t.scaleY),
  }
}

// ─── Background resolution ────────────────────────────────────────────────────

function resolveBackground(
  slideDoc: Document,
  layoutDoc: Document | null,
  masterDoc: Document | null,
  themeColors: ThemeColors,
): string | undefined {
  return (
    extractDocBackground(slideDoc,  themeColors) ??
    (layoutDoc ? extractDocBackground(layoutDoc, themeColors) : undefined) ??
    (masterDoc ? extractDocBackground(masterDoc, themeColors) : undefined)
  )
}

function extractDocBackground(doc: Document, themeColors: ThemeColors): string | undefined {
  // <p:bg><p:bgPr><a:solidFill> — explicit solid background
  const bgPr = qs(doc, 'bgPr')
  if (bgPr) {
    const solidFill = qs(bgPr, 'solidFill')
    if (solidFill) {
      const color = resolveColorEl(solidFill, themeColors)
      if (color) return color
    }
    // Gradient — use first stop color as representative
    const gradFill = qs(bgPr, 'gradFill')
    if (gradFill) {
      const gsLst   = qs(gradFill, 'gsLst')
      const firstGs = gsLst ? qs(gsLst, 'gs') : null
      if (firstGs) {
        const sf    = qs(firstGs, 'solidFill') ?? firstGs
        const color = resolveColorEl(sf, themeColors)
        if (color) return color
      }
    }
  }

  // <p:bg><p:bgRef idx="..."> — background style ref with an embedded color (common in masters)
  const bg = qs(doc, 'bg')
  if (bg) {
    const bgRef = qs(bg, 'bgRef')
    if (bgRef) {
      const color = resolveColorEl(bgRef, themeColors)
      if (color) return color
    }
  }

  return undefined
}
