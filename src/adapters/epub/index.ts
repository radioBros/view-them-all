import JSZip from 'jszip'
import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Block, Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { normalizeMeta } from '../../core/model/meta'
import { getMimeType } from '../../shared/mime'
import { parseXml } from './xml'
import { parseContainer } from './parser/container'
import { parseOpf } from './parser/opf'
import { parseHtmlChapter, resolveImageSrcs } from './parser/html'

const MAX_BYTES      = 200 * 1024 * 1024  // 200 MB
const MAX_CHAPTERS   = 50

// Image media-type prefixes
const IMAGE_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'image/svg+xml', 'image/bmp', 'image/tiff',
])

export const epubAdapter: Adapter = {
  name: 'epub',
  extensions: ['epub'],
  mimeTypes: ['application/epub+zip'],

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
      return err({ code: 'CORRUPT_FILE', message: `Failed to unzip EPUB: ${String(e)}`, source: e })
    }

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after unzip' })

    // Step 3: Read META-INF/container.xml → OPF path
    const containerFile = zip.file('META-INF/container.xml')
    if (!containerFile) {
      return err({ code: 'CORRUPT_FILE', message: 'META-INF/container.xml not found' })
    }

    let containerXml: Document
    try {
      const containerText = await containerFile.async('string')
      containerXml = parseXml(containerText)
    } catch (e) {
      return err({ code: 'CORRUPT_FILE', message: `Failed to read container.xml: ${String(e)}`, source: e })
    }

    const opfPath = parseContainer(containerXml)
    if (!opfPath) {
      return err({ code: 'CORRUPT_FILE', message: 'No rootfile found in container.xml' })
    }

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after container parse' })

    // Step 4: Read OPF → spine + manifest + meta
    const opfFile = zip.file(opfPath)
    if (!opfFile) {
      return err({ code: 'CORRUPT_FILE', message: `OPF file not found: ${opfPath}` })
    }

    let opfResult
    try {
      const opfText = await opfFile.async('string')
      const opfXml  = parseXml(opfText)
      opfResult     = parseOpf(opfXml, opfPath)
    } catch (e) {
      return err({ code: 'CORRUPT_FILE', message: `Failed to parse OPF: ${String(e)}`, source: e })
    }

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after OPF parse' })

    // Step 5: Build mediaMap — all image entries → blob URLs
    const mediaMap = new Map<string, string>()
    await buildMediaMap(zip, mediaMap)

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after media map' })

    // Step 6: Process spine chapters
    const blocks: Block[] = []
    const spine = opfResult.spine.slice(0, MAX_CHAPTERS)

    for (let i = 0; i < spine.length; i++) {
      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted between chapters' })

      const chapterPath = spine[i]!
      const chapterFile = zip.file(chapterPath)
      if (!chapterFile) continue

      let chapterContent: string
      try {
        chapterContent = await chapterFile.async('string')
      } catch {
        continue
      }

      const chapterBlocks = parseHtmlChapter(chapterContent)

      // Determine baseDir for this chapter
      const chapterDir = chapterPath.includes('/')
        ? chapterPath.split('/').slice(0, -1).join('/')
        : ''

      const resolvedBlocks = resolveImageSrcs(chapterBlocks, chapterDir, mediaMap)

      blocks.push(...resolvedBlocks)

      // Add HrBlock separator between chapters (not after the last one)
      if (i < spine.length - 1) {
        blocks.push({ type: 'hr' })
      }
    }

    // Step 7: Build meta
    const meta = normalizeMeta({
      title:     opfResult.title,
      author:    opfResult.author,
      language:  opfResult.language,
      pageCount: opfResult.spine.length,
    })

    return ok({ blocks, meta })
  },
}

async function buildMediaMap(zip: JSZip, mediaMap: Map<string, string>): Promise<void> {
  const tasks: Promise<void>[] = []

  zip.forEach((relativePath, file) => {
    if (file.dir) return
    const mime = getMimeType(relativePath)
    if (!IMAGE_TYPES.has(mime)) return

    tasks.push(
      file.async('arraybuffer').then(data => {
        const blob   = new Blob([data], { type: mime })
        const blobUrl = URL.createObjectURL(blob)
        mediaMap.set(relativePath, blobUrl)
      }).catch(() => { /* skip failed entries */ }),
    )
  })

  await Promise.all(tasks)
}
