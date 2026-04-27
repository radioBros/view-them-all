import type { DocumentModel } from '../core/model/types'
import { renderBlock } from './blocks/index'

export function render(doc: DocumentModel, container: HTMLElement): void {
  const frag = document.createDocumentFragment()
  const temp = document.createElement('div')

  for (const block of doc.blocks) {
    renderBlock(block, temp)
  }

  while (temp.firstChild) frag.appendChild(temp.firstChild)

  container.innerHTML = ''
  container.appendChild(frag)
}
