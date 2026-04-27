import type { ListBlock } from '../../core/model/types'
import { renderInline } from '../inline/renderInline'

export function renderList(block: ListBlock): HTMLElement {
  const list = document.createElement(block.ordered ? 'ol' : 'ul')
  list.className = block.ordered ? 'ufpe-list-ordered' : 'ufpe-list-unordered'

  for (const item of block.items) {
    const li = document.createElement('li')
    li.className = 'ufpe-list-item'
    const frag = document.createDocumentFragment()
    for (const node of renderInline(item.content)) frag.appendChild(node)
    li.appendChild(frag)
    if (item.children) {
      li.appendChild(renderList(item.children))
    }
    list.appendChild(li)
  }

  return list
}
