import JSZip from 'jszip'
import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { normalizeMeta } from '../../core/model/meta'
import { parseXml, qs } from './xml'
import { parseOdpSlides } from './parser/content'

const MAX_BYTES = 100 * 1024 * 1024  // 100 MB

export const odpAdapter: Adapter = {
  name: 'odp',
  extensions: ['odp', 'otp', 'fodp'],
  mimeTypes: [
    'application/vnd.oasis.opendocument.presentation',
    'application/vnd.oasis.opendocument.presentation-template',
  ],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted before start' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file

    if (buffer.byteLength > MAX_BYTES) {
      return err({ code: 'FILE_TOO_LARGE', message: `File exceeds ${MAX_BYTES / 1024 / 1024} MB limit` })
    }

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    let zip: JSZip
    try {
      zip = await JSZip.loadAsync(buffer)
    } catch (e) {
      return err({ code: 'CORRUPT_FILE', message: `Failed to unzip: ${String(e)}`, source: e })
    }

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after unzip' })

    const contentFile = zip.file('content.xml')
    if (!contentFile) {
      return err({ code: 'CORRUPT_FILE', message: 'content.xml not found in ODP archive' })
    }

    let contentXmlText: string
    try {
      contentXmlText = await contentFile.async('string')
    } catch (e) {
      return err({ code: 'CORRUPT_FILE', message: `Failed to read content.xml: ${String(e)}`, source: e })
    }

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after XML read' })

    let contentXml: Document
    try {
      contentXml = parseXml(contentXmlText)
    } catch (e) {
      return err({ code: 'PARSE_FAILED', message: `Failed to parse content.xml: ${String(e)}`, source: e })
    }

    // Read styles.xml for master page background colors (optional)
    let stylesXml: Document | null = null
    try {
      const stylesFile = zip.file('styles.xml')
      if (stylesFile) {
        const stylesText = await stylesFile.async('string')
        stylesXml = parseXml(stylesText)
      }
    } catch {
      // styles.xml is optional; ignore parse errors
    }

    let blocks
    try {
      blocks = await parseOdpSlides(contentXml, zip, options, stylesXml)
    } catch (e) {
      return err({ code: 'PARSE_FAILED', message: `Failed to parse slides: ${String(e)}`, source: e })
    }

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after slide parse' })

    // Read meta.xml for document metadata
    const meta = await extractMeta(zip, blocks.length)

    return ok({ blocks, meta })
  },
}

async function extractMeta(zip: JSZip, slideCount: number): Promise<ReturnType<typeof normalizeMeta>> {
  try {
    const metaFile = zip.file('meta.xml')
    if (!metaFile) return normalizeMeta({ slideCount })

    const metaText = await metaFile.async('string')
    const metaDoc  = parseXml(metaText)

    const title    = qs(metaDoc, 'title')?.textContent?.trim() || undefined
    const creator  = (qs(metaDoc, 'initial-creator')?.textContent?.trim()
               ?? qs(metaDoc, 'creator')?.textContent?.trim())
               || undefined
    const created  = qs(metaDoc, 'creation-date')?.textContent?.trim()
    const modified = qs(metaDoc, 'date')?.textContent?.trim()

    return normalizeMeta({
      title,
      author:   creator,
      created:  created  ? new Date(created)  : undefined,
      modified: modified ? new Date(modified) : undefined,
      slideCount,
    })
  } catch {
    return normalizeMeta({ slideCount })
  }
}
