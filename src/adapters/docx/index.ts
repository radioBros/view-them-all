import JSZip from 'jszip'
import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { normalizeMeta } from '../../core/model/meta'
import { parseXml } from './xml'
import { parseRelationships } from './parser/relationships'
import { parseStyles } from './parser/styles'
import { parseNumbering } from './parser/numbering'
import { parseDocument } from './parser/document'

export const docxAdapter: Adapter = {
  name: 'docx',
  extensions: ['docx'],
  mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted before start' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    try {
      const zip = await JSZip.loadAsync(buffer)

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after unzip' })

      // Read required XML files
      const [docXml, stylesXml, relsXml, numberingXml, coreXml] = await Promise.all([
        readZipFile(zip, 'word/document.xml'),
        readZipFile(zip, 'word/styles.xml'),
        readZipFile(zip, 'word/_rels/document.xml.rels'),
        readZipFile(zip, 'word/numbering.xml'),
        readZipFile(zip, 'docProps/core.xml'),
      ])

      if (!docXml) {
        return err({ code: 'CORRUPT_FILE', message: 'word/document.xml not found' })
      }

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after XML read' })

      const rels      = parseRelationships(relsXml ?? '')
      const styles    = parseStyles(stylesXml ?? '')
      const numbering = parseNumbering(numberingXml ?? '')

      const doc  = parseXml(docXml)
      // getElementsByTagNameNS('*', 'body') matches <w:body> in jsdom XML mode
      const body = doc.getElementsByTagNameNS('*', 'body')[0] ?? null
      if (!body) return err({ code: 'CORRUPT_FILE', message: 'Missing <w:body> in document.xml' })

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted before body parse' })

      const blocks = await parseDocument(body, {
        rels,
        styles,
        numbering,
        zip,
        signal: options?.signal,
      })

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after body parse' })

      const meta = normalizeMeta(extractCoreMeta(coreXml ?? ''))

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

function extractCoreMeta(coreXml: string): Record<string, unknown> {
  if (!coreXml) return {}
  try {
    const doc      = parseXml(coreXml)
    const title    = doc.querySelector('title')?.textContent
    const creator  = doc.querySelector('creator')?.textContent
    const created  = doc.querySelector('created')?.textContent
    const modified = doc.querySelector('modified')?.textContent
    const subject  = doc.querySelector('subject')?.textContent
    const keywords = doc.querySelector('keywords')?.textContent

    return {
      title,
      author:   creator,
      created:  created  ? new Date(created)  : undefined,
      modified: modified ? new Date(modified) : undefined,
      subject,
      keywords: keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
    }
  } catch {
    return {}
  }
}
