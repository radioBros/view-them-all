import type { ImageBlock } from '../../core/model/types'

export function renderImage(block: ImageBlock): HTMLElement {
  const figure = document.createElement('figure')
  figure.className = 'ufpe-image-block'

  const img = document.createElement('img')
  img.src = block.src
  img.alt = block.alt ?? ''
  img.className = 'ufpe-image'
  if (block.width)  img.width  = block.width
  if (block.height) img.height = block.height

  figure.appendChild(img)

  if (block.caption) {
    const cap = document.createElement('figcaption')
    cap.className = 'ufpe-image-caption'
    cap.textContent = block.caption
    figure.appendChild(cap)
  }

  return figure
}
