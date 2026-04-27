import { describe, it, expect } from 'vitest'
import { renderTable } from '../../../src/renderer/blocks/renderTable'
import type { TableBlock } from '../../../src/core/model/types'

const block: TableBlock = {
  type: 'table',
  rows: [
    { cells: [
      { content: [{ type: 'text', text: 'Name' }], isHeader: true },
      { content: [{ type: 'text', text: 'Age'  }], isHeader: true },
    ]},
    { cells: [
      { content: [{ type: 'text', text: 'Alice' }], isHeader: false },
      { content: [{ type: 'text', text: '30'    }], isHeader: false },
    ]},
  ],
}

describe('renderTable', () => {
  it('renders <th> for isHeader: true cells', () => {
    const el = renderTable(block)
    expect(el.querySelectorAll('th').length).toBe(2)
    expect(el.querySelectorAll('td').length).toBe(2)
  })

  it('renders table wrapper + table elements', () => {
    const el = renderTable(block)
    expect(el.className).toBe('ufpe-table-wrapper')
    expect(el.querySelector('table')).not.toBeNull()
    expect(el.querySelector('tbody')).not.toBeNull()
  })

  it('never uses innerHTML for cell content (XSS)', () => {
    const xss: TableBlock = { type: 'table', rows: [{
      cells: [{ content: [{ type: 'text', text: '<script>alert(1)</script>' }], isHeader: false }]
    }]}
    const el = renderTable(xss)
    expect(el.innerHTML).not.toContain('<script>')
    expect(el.textContent).toContain('<script>alert(1)</script>')
  })

  it('sets colspan and rowspan', () => {
    const merged: TableBlock = { type: 'table', rows: [{
      cells: [{ content: [], isHeader: false, colspan: 3, rowspan: 2 }]
    }]}
    const el = renderTable(merged)
    const td = el.querySelector('td')!
    expect(td.colSpan).toBe(3)
    expect(td.rowSpan).toBe(2)
  })

  it('renders caption when provided', () => {
    const withCap: TableBlock = { ...block, caption: 'My Table' }
    const el = renderTable(withCap)
    const cap = el.querySelector('caption')
    expect(cap?.textContent).toBe('My Table')
  })
})
