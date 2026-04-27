import JSZip from 'jszip'
import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { normalizeMeta } from '../../core/model/meta'
import { parseXml, qs } from './xml'
import { parseOdtContent } from './parser/content'

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

export const odtAdapter: Adapter = {
  name: 'odt',
  extensions: ['odt', 'ott', 'fodt'],
  mimeTypes: [
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.text-template',
  ],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted before start' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file

    if (buffer.byteLength > MAX_BYTES) {
      return err({ code: 'FILE_TOO_LARGE', message: `File exceeds ${MAX_BYTES} bytes` })
    }

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    try {
      const zip = await JSZip.loadAsync(buffer)

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after unzip' })

      const contentXmlStr = await readZipFile(zip, 'content.xml')
      if (!contentXmlStr) {
        return err({ code: 'CORRUPT_FILE', message: 'content.xml not found in ODT archive' })
      }

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after XML read' })

      // Extract media files as blob URLs
      const mediaMap = new Map<string, string>()
      for (const [path, zipFile] of Object.entries(zip.files)) {
        if (!zipFile.dir && (path.startsWith('Pictures/') || path.startsWith('media/'))) {
          const buf = await zipFile.async('arraybuffer')
          const ext = path.split('.').pop()?.toLowerCase() ?? ''
          const mime = (
            { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml' } as Record<string, string>
          )[ext] ?? 'application/octet-stream'
          mediaMap.set(path, URL.createObjectURL(new Blob([buf], { type: mime })))
        }
      }

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after media extraction' })

      const contentDoc  = parseXml(contentXmlStr)
      const stylesXmlStr = await readZipFile(zip, 'styles.xml')
      const stylesDoc    = stylesXmlStr ? parseXml(stylesXmlStr) : null
      const blocks = parseOdtContent(contentDoc, mediaMap, stylesDoc)

      // Parse meta.xml (optional)
      const metaXmlStr = await readZipFile(zip, 'meta.xml')
      const meta = normalizeMeta(extractOdtMeta(metaXmlStr ?? ''))

      return ok({ blocks, meta })
    } catch (e) {
      return err({ code: 'CORRUPT_FILE', message: String(e), source: e })
    }
  },
}

async function readZipFile(zip: JSZip, path: string): Promise<string | null> {
  try {
    const file = zip.file(path)
    if (!file) return null
    return await file.async('string')
  } catch {
    return null
  }
}

function extractOdtMeta(metaXml: string): Record<string, unknown> {
  if (!metaXml) return {}
  try {
    const doc = parseXml(metaXml)
    const title   = qs(doc, 'title')?.textContent ?? undefined
    const creator = qs(doc, 'creator')?.textContent ?? undefined
    const date    = qs(doc, 'date')?.textContent ?? undefined
    return {
      title,
      author:  creator,
      created: date ? new Date(date) : undefined,
    }
  } catch {
    return {}
  }
}
