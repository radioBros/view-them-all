import type { Inline, SlideElement, TableRow, TableCell } from '../../../core/model/types'
import { qs, qsAll } from '../xml'
import { parseTxBody } from './run'
import type { ThemeColors } from './theme'
import { resolveColorEl } from './theme'

/**
 * Parse a <p:graphicFrame> containing a DrawingML table (<a:tbl>) into a SlideElement.
 * Returns null if the frame contains no table or the table has no rows.
 */
export function parseTableShape(
  graphicFrame: Element,
  canvasW: number,
  canvasH: number,
  themeColors: ThemeColors = new Map(),
): SlideElement | null {
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

  const tbl = qs(graphicFrame, 'tbl')
  if (!tbl) return null

  const rows: TableRow[] = []
  const trEls = qsAll(tbl, 'tr')

  for (let rowIdx = 0; rowIdx < trEls.length; rowIdx++) {
    const tr = trEls[rowIdx]!
    const cells: TableCell[] = []

    for (const tc of qsAll(tr, 'tc')) {
      // Skip continuation cells of horizontal/vertical merges
      if (tc.getAttribute('hMerge') === '1' || tc.getAttribute('vMerge') === '1') continue

      const txBody     = qs(tc, 'txBody')
      const paragraphs = txBody ? parseTxBody(txBody, themeColors) : []

      // Flatten paragraphs → flat inline array for TableCell
      const content: Inline[] = []
      for (let i = 0; i < paragraphs.length; i++) {
        content.push(...paragraphs[i]!.content)
        if (i < paragraphs.length - 1) {
          content.push({ type: 'text', text: '\n' })
        }
      }

      const colspan = parseInt(tc.getAttribute('gridSpan') ?? '1', 10) || 1
      const rowspan = parseInt(tc.getAttribute('rowSpan') ?? '1', 10) || 1

      // Cell fill color from <a:tcPr><a:solidFill>
      let backgroundColor: string | undefined
      const tcPr = qs(tc, 'tcPr')
      if (tcPr) {
        const solidFill = qs(tcPr, 'solidFill')
        if (solidFill) backgroundColor = resolveColorEl(solidFill, themeColors)
      }

      const cell: TableCell = { content, isHeader: rowIdx === 0 }
      if (colspan > 1)       cell.colspan         = colspan
      if (rowspan > 1)       cell.rowspan         = rowspan
      if (backgroundColor)   cell.backgroundColor = backgroundColor
      cells.push(cell)
    }

    if (cells.length > 0) rows.push({ cells })
  }

  if (rows.length === 0) return null

  return { type: 'table', x, y, width, height, rows }
}
