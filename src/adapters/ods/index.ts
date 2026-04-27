import JSZip from 'jszip'
import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { normalizeMeta } from '../../core/model/meta'
import { parseXml, qs, attr } from './xml'
import { parseOdsContent } from './parser/content'

const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

export const odsAdapter: Adapter = {
  name: 'ods',
  extensions: ['ods', 'ots', 'fods'],
  mimeTypes: [
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.spreadsheet-template',
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
        return err({ code: 'CORRUPT_FILE', message: 'content.xml not found in ODS archive' })
      }

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after XML read' })

      const contentDoc = parseXml(contentXmlStr)
      const blocks = parseOdsContent(contentDoc)

      // Extract sheet names from table:name attributes
      const tables = contentDoc.getElementsByTagNameNS('*', 'table')
      const sheetNames: string[] = Array.from(tables).map(
        (t, i) => attr(t, 'table:name', 'name') ?? `Sheet${i + 1}`
      )

      // Parse meta.xml (optional)
      const metaXmlStr = await readZipFile(zip, 'meta.xml')
      const rawMeta = extractOdsMeta(metaXmlStr ?? '')
      const meta = normalizeMeta({ ...rawMeta, sheetNames })

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

function extractOdsMeta(metaXml: string): Record<string, unknown> {
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
