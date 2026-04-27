import type { TableBlock, TableRow, TableCell, Inline } from '../../../core/model/types'
import type { RunContext } from './run'
import { parseRun } from './run'
import { qs, qsAll, wAttr } from '../xml'

export function parseTable(tbl: Element, ctx: RunContext): TableBlock {
  const rows: TableRow[] = []
  const mergeMap = new Map<string, { colspan: number; rowspan: number } | 'skip'>()

  let rowIdx = 0
  for (const tr of Array.from(tbl.children).filter(c => c.tagName.endsWith(':tr') || c.tagName === 'tr')) {
    const cells: TableCell[] = []
    let colIdx = 0

    for (const tc of Array.from(tr.children).filter(c => c.tagName.endsWith(':tc') || c.tagName === 'tc')) {
      while (mergeMap.get(`${rowIdx},${colIdx}`) === 'skip') colIdx++

      const tcPr     = qs(tc, 'tcPr')
      const vMerge   = tcPr ? qs(tcPr, 'vMerge') : null
      const gridSpan = parseInt(wAttr(tcPr ? qs(tcPr, 'gridSpan') : null, 'val') ?? '1')
      const isHeader = !!(tcPr ? qs(tcPr, 'tblHeader') : null)

      if (vMerge && !wAttr(vMerge, 'val')) {
        mergeMap.set(`${rowIdx},${colIdx}`, 'skip')
        colIdx++
        continue
      }

      const content  = parseCellContent(tc, ctx)
      const rowspan  = vMerge ? countVerticalMerge(tbl, rowIdx, colIdx) : 1
      const colspan  = gridSpan

      for (let r = rowIdx; r < rowIdx + rowspan; r++) {
        for (let c = colIdx; c < colIdx + colspan; c++) {
          if (r !== rowIdx || c !== colIdx) {
            mergeMap.set(`${r},${c}`, 'skip')
          }
        }
      }

      // Cell background shading: <w:tcPr><w:shd w:fill="RRGGBB" w:val="clear"/>
      let backgroundColor: string | undefined
      const shdEl = tcPr ? qs(tcPr, 'shd') : null
      if (shdEl) {
        const fill = wAttr(shdEl, 'fill')
        if (fill && fill !== 'auto' && fill !== '000000' /* skip black default */) {
          backgroundColor = `#${fill}`
        }
      }

      cells.push({
        content,
        isHeader,
        colspan:         colspan > 1      ? colspan         : undefined,
        rowspan:         rowspan > 1      ? rowspan         : undefined,
        backgroundColor: backgroundColor  ? backgroundColor : undefined,
      })

      colIdx += colspan
    }

    rows.push({ cells })
    rowIdx++
  }

  return { type: 'table', rows }
}

function parseCellContent(tc: Element, ctx: RunContext): Inline[] {
  const content: Inline[] = []
  for (const p of qsAll(tc, 'p')) {
    for (const child of Array.from(p.children)) {
      if (child.tagName.endsWith(':r') || child.tagName === 'r') {
        content.push(...parseRun(child, ctx))
      } else if (child.tagName.endsWith(':hyperlink') || child.tagName === 'hyperlink') {
        const rId = child.getAttribute('r:id') ?? undefined
        for (const run of qsAll(child, 'r')) {
          content.push(...parseRun(run, ctx, rId))
        }
      }
    }
  }
  return content.length > 0 ? content : [{ type: 'text', text: '' }]
}

function countVerticalMerge(tbl: Element, startRow: number, col: number): number {
  const rows = qsAll(tbl, 'tr')
  let count = 1
  for (let r = startRow + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row) break
    const tcs   = qsAll(row, 'tc')
    const tc    = tcs[col]
    if (!tc) break
    const vMerge = qs(tc, 'vMerge')
    if (vMerge && !wAttr(vMerge, 'val')) {
      count++
    } else {
      break
    }
  }
  return count
}
