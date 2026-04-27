import type { HeadingBlock } from '../../core/model/types'
import { renderInline } from '../inline/renderInline'

export function renderHeading(block: HeadingBlock): HTMLElement {
  const h = document.createElement(`h${block.level}`) as HTMLHeadingElement
  h.className = `ufpe-heading ufpe-h${block.level}`
  const frag = document.createDocumentFragment()
  for (const node of renderInline(block.content)) frag.appendChild(node)
  h.appendChild(frag)
  return h
}
