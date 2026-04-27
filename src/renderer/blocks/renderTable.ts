import type { TableBlock } from '../../core/model/types'
import { renderInline } from '../inline/renderInline'

export function renderTable(block: TableBlock): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'ufpe-table-wrapper'

  const table = document.createElement('table')
  table.className = 'ufpe-table'

  if (block.caption) {
    const caption = document.createElement('caption')
    caption.textContent = block.caption
    table.appendChild(caption)
  }

  const tbody = document.createElement('tbody')
  const frag  = document.createDocumentFragment()

  for (const row of block.rows) {
    const tr = document.createElement('tr')
    tr.className = 'ufpe-table-row'

    for (const cell of row.cells) {
      const td = document.createElement(cell.isHeader ? 'th' : 'td')
      td.className = cell.isHeader ? 'ufpe-table-header' : 'ufpe-table-cell'
      if (cell.colspan && cell.colspan > 1) td.colSpan = cell.colspan
      if (cell.rowspan && cell.rowspan > 1) td.rowSpan = cell.rowspan
      if (cell.backgroundColor)             td.style.backgroundColor = cell.backgroundColor

      const cellFrag = document.createDocumentFragment()
      for (const node of renderInline(cell.content)) cellFrag.appendChild(node)
      td.appendChild(cellFrag)
      tr.appendChild(td)
    }

    frag.appendChild(tr)
  }

  tbody.appendChild(frag)
  table.appendChild(tbody)
  wrapper.appendChild(table)
  return wrapper
}
