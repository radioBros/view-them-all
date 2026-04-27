import type { SlideBlock } from '../../core/model/types'
import { renderInline } from '../inline/renderInline'

export function renderSlide(block: SlideBlock): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'ufpe-slide'

  // ── High-fidelity path: pre-rendered HTML from @jvmr/pptx-to-html ────────
  if (block.rawHtml) {
    wrapper.innerHTML = block.rawHtml
    const slideDiv = wrapper.firstElementChild as HTMLElement | null
    if (slideDiv) {
      const nativeW = parseFloat(slideDiv.style.width)  || 960
      const nativeH = parseFloat(slideDiv.style.height) || 540
      wrapper.style.setProperty('--ufpe-slide-ar', `${nativeW} / ${nativeH}`)
      slideDiv.style.transformOrigin = '0 0'
      slideDiv.style.position = 'absolute'
      slideDiv.style.top  = '0'
      slideDiv.style.left = '0'
      new ResizeObserver(() => {
        const w = wrapper.getBoundingClientRect().width
        if (w > 0) slideDiv.style.transform = `scale(${w / nativeW})`
      }).observe(wrapper)
    }
    if (block.notes) {
      const notes = document.createElement('aside')
      notes.className = 'ufpe-slide-notes'
      notes.textContent = block.notes
      wrapper.appendChild(notes)
    }
    return wrapper
  }

  // ── Fallback: element-based rendering ────────────────────────────────────
  wrapper.style.setProperty('--ufpe-slide-ar', `${block.canvasWidth} / ${block.canvasHeight}`)
  const canvasHeightPt = block.canvasHeight / 914400 * 72
  wrapper.style.setProperty('--ufpe-canvas-h-pt', canvasHeightPt.toFixed(2))
  if (block.background) {
    wrapper.style.setProperty('--ufpe-slide-bg', block.background)
  }

  for (const el of block.elements) {
    const child = document.createElement('div')
    child.className = `ufpe-slide-element ufpe-slide-${el.type}`

    child.style.left   = `${(el.x      / block.canvasWidth)  * 100}%`
    child.style.top    = `${(el.y      / block.canvasHeight) * 100}%`
    child.style.width  = `${(el.width  / block.canvasWidth)  * 100}%`
    child.style.height = `${(el.height / block.canvasHeight) * 100}%`

    if (el.type === 'text') {
      if (el.backgroundColor) child.style.backgroundColor = el.backgroundColor
      if (el.verticalAlign) {
        child.style.display        = 'flex'
        child.style.flexDirection  = 'column'
        if (el.verticalAlign === 'middle') child.style.justifyContent = 'center'
        else if (el.verticalAlign === 'bottom') child.style.justifyContent = 'flex-end'
      }
      for (const para of el.paragraphs) {
        const p = document.createElement('p')
        p.className = 'ufpe-slide-para'
        if (para.align) p.style.textAlign = para.align
        if (para.indent && para.indent > 0) p.style.paddingLeft = `${para.indent * 1.5}em`
        if (para.bullet) {
          const bulletSpan = document.createElement('span')
          bulletSpan.className = 'ufpe-slide-bullet'
          bulletSpan.textContent = para.bullet + ' '
          p.appendChild(bulletSpan)
        }
        const frag = document.createDocumentFragment()
        for (const node of renderInline(para.content)) frag.appendChild(node)
        p.appendChild(frag)
        child.appendChild(p)
      }
    } else if (el.type === 'image') {
      const img = document.createElement('img')
      img.src = el.src
      img.alt = el.alt ?? ''
      img.className = 'ufpe-slide-image'
      child.appendChild(img)
    } else if (el.type === 'table') {
      const table = document.createElement('table')
      table.className = 'ufpe-slide-table'
      for (const row of el.rows) {
        const tr = document.createElement('tr')
        for (const cell of row.cells) {
          const td = document.createElement(cell.isHeader ? 'th' : 'td')
          if (cell.colspan && cell.colspan > 1) td.colSpan = cell.colspan
          if (cell.rowspan && cell.rowspan > 1) td.rowSpan = cell.rowspan
          if (cell.backgroundColor)              td.style.backgroundColor = cell.backgroundColor
          const frag = document.createDocumentFragment()
          for (const node of renderInline(cell.content)) frag.appendChild(node)
          td.appendChild(frag)
          tr.appendChild(td)
        }
        table.appendChild(tr)
      }
      child.appendChild(table)
    }

    wrapper.appendChild(child)
  }

  if (block.notes) {
    const notes = document.createElement('aside')
    notes.className = 'ufpe-slide-notes'
    notes.textContent = block.notes
    wrapper.appendChild(notes)
  }

  return wrapper
}
