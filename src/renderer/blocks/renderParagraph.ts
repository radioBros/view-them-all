import type { ParagraphBlock } from '../../core/model/types'
import { renderInline } from '../inline/renderInline'

export function renderParagraph(block: ParagraphBlock): HTMLElement {
  const p = document.createElement('p')
  p.className = 'ufpe-paragraph'
  const frag = document.createDocumentFragment()
  for (const node of renderInline(block.content)) frag.appendChild(node)
  p.appendChild(frag)
  return p
}
