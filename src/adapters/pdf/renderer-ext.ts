import type { PdfEmbedBlock } from './types'

export function renderPdfEmbed(block: PdfEmbedBlock, container: HTMLElement): void {
  const wrapper = document.createElement('div')
  wrapper.className = 'ufpe-pdf-embed'

  const iframe = document.createElement('iframe')
  iframe.src = block.src
  iframe.title = 'PDF preview'
  iframe.className = 'ufpe-pdf-iframe'

  wrapper.appendChild(iframe)
  container.appendChild(wrapper)
}
