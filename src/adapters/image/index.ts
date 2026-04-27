import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { getMimeType } from '../../shared/mime'

// Phase 2: Image adapter with SVG sanitization, zoom/pan/rotate viewer
export const imageAdapter: Adapter = {
  name: 'image',
  extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tiff', 'tif', 'svg'],
  mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file
    const name   = file instanceof File ? file.name : ''
    const ext    = name.split('.').pop()?.toLowerCase() ?? ''

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    try {
      let src: string
      if (ext === 'svg') {
        const text      = new TextDecoder().decode(buffer)
        const sanitized = sanitizeSvg(text)
        const blob      = new Blob([sanitized], { type: 'image/svg+xml' })
        src             = URL.createObjectURL(blob)
      } else {
        const mime = getMimeType(name)
        src        = URL.createObjectURL(new Blob([buffer], { type: mime }))
      }

      return ok({ blocks: [{ type: 'image', src }], meta: {} })
    } catch (e) {
      return err({ code: 'PARSE_FAILED', message: String(e), source: e })
    }
  },
}

export function sanitizeSvg(svgText: string): string {
  const parser = new DOMParser()
  const doc    = parser.parseFromString(svgText, 'image/svg+xml')

  doc.querySelectorAll('script, foreignObject, use').forEach(el => el.remove())

  doc.querySelectorAll('*').forEach(el => {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name)
      if ((attr.name === 'href' || attr.name === 'xlink:href') &&
          /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  })

  return new XMLSerializer().serializeToString(doc.documentElement)
}
