import type { Block } from '../../core/model/types'
import { getBlockRenderer } from '../extensions'
import { renderParagraph }  from './renderParagraph'
import { renderHeading }    from './renderHeading'
import { renderList }       from './renderList'
import { renderTable }      from './renderTable'
import { renderImage }      from './renderImage'
import { renderCode }       from './renderCode'
import { renderSlide }      from './renderSlide'
import { renderUnknown, renderHr } from './renderUnknown'

export function renderBlock(block: Block, container: HTMLElement): void {
  try {
    const ext = getBlockRenderer(block.type)
    if (ext) {
      ext(block, container)
      return
    }

    let el: HTMLElement
    switch (block.type) {
      case 'paragraph': el = renderParagraph(block); break
      case 'heading':   el = renderHeading(block);   break
      case 'list':      el = renderList(block);       break
      case 'table':     el = renderTable(block);      break
      case 'image':     el = renderImage(block);      break
      case 'code':      el = renderCode(block);       break
      case 'hr':        el = renderHr();              break
      case 'slide':     el = renderSlide(block);      break
      case 'unknown':   el = renderUnknown(block);    break
      default:
        el = renderUnknown({ type: 'unknown', raw: (block as Block).type })
    }
    container.appendChild(el)
  } catch (e) {
    console.error('[ufpe] Block render error:', e)
    container.appendChild(renderUnknown({ type: 'unknown' }))
  }
}

export {
  renderParagraph, renderHeading, renderList, renderTable,
  renderImage, renderCode, renderSlide, renderHr, renderUnknown,
}
