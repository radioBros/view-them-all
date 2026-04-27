import type { UnknownBlock } from '../../core/model/types'

export function renderUnknown(block: UnknownBlock): HTMLElement {
  const el = document.createElement('div')
  el.className = 'ufpe-unknown-block'
  return el
}

export function renderHr(): HTMLElement {
  const hr = document.createElement('hr')
  hr.className = 'ufpe-hr'
  return hr
}
