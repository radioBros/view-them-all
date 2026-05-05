import type { DocumentModel, ParseError } from '../core/model/types'
import { render }      from './render'
import { renderError } from './renderError'

type ContainerMeta = {
  objectUrls: Set<string>
}

const meta = new WeakMap<HTMLElement, ContainerMeta>()

export function mount(container: HTMLElement, model: DocumentModel): void {
  unmount(container)

  const objectUrls = new Set<string>()
  meta.set(container, { objectUrls })

  try {
    render(model, container)
    collectObjectUrls(container, objectUrls)
  } catch (e) {
    console.error('[ufpe] Render failed:', e)
    const error: ParseError = { code: 'UNKNOWN', message: String(e), source: e }
    renderError(error, container)
  }
}

export function unmount(container: HTMLElement): void {
  const m = meta.get(container)
  if (m) {
    for (const url of m.objectUrls) URL.revokeObjectURL(url)
    meta.delete(container)
  }
  container.innerHTML = ''
}

function collectObjectUrls(container: HTMLElement, set: Set<string>): void {
  container.querySelectorAll('[src]').forEach(el => {
    const src = el.getAttribute('src') ?? ''
    if (src.startsWith('blob:')) {
      // Strip fragment so revokeObjectURL receives the bare blob URL
      set.add(src.split('#')[0] ?? src)
    }
  })
}
