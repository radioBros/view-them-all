import type { PdfEmbedBlock, PdfViewerConfig } from './types'

export function renderPdfEmbed(block: PdfEmbedBlock, container: HTMLElement): void {
  const wrapper = document.createElement('div')
  wrapper.className = 'ufpe-pdf-embed'

  const iframe = document.createElement('iframe')
  iframe.src = buildPdfSrc(block.src, block.viewerConfig)
  iframe.title = 'PDF preview'
  iframe.className = 'ufpe-pdf-iframe'

  wrapper.appendChild(iframe)
  container.appendChild(wrapper)
}

function buildPdfSrc(src: string, config?: PdfViewerConfig): string {
  if (!config) return src

  const { page, zoom, search, navpanes, toolbar, scrollbar, pagemode } = config
  const params: string[] = []

  // All params go in the hash fragment — blob: URLs don't support querystrings
  // in browser PDF viewers. Format: blob:...uuid#param1=v1&param2=v2
  if (page      !== undefined) params.push(`page=${page}`)
  if (zoom      !== undefined) params.push(`zoom=${zoom}`)
  if (search    !== undefined) params.push(`search=${encodeURIComponent(search)}`)
  if (navpanes  !== undefined) params.push(`navpanes=${navpanes ? 1 : 0}`)
  if (toolbar   !== undefined) params.push(`toolbar=${toolbar ? 1 : 0}`)
  if (scrollbar !== undefined) params.push(`scrollbar=${scrollbar ? 1 : 0}`)
  if (pagemode  !== undefined) params.push(`pagemode=${pagemode}`)

  return params.length ? `${src}#${params.join('&')}` : src
}
