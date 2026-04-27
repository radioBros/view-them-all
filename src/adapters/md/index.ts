import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { DocumentModel, Result, HeadingBlock, TextInline } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { parseBlocks } from './parser/blocks'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export const mdAdapter: Adapter = {
  name: 'md',
  extensions: ['md', 'mdx', 'markdown'],
  mimeTypes: ['text/markdown', 'text/x-markdown'],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<DocumentModel>> {
    const size = file instanceof File ? file.size : file.byteLength

    if (size > MAX_SIZE) {
      return err({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds 10 MB (${(size / 1024 / 1024).toFixed(1)} MB)`,
      })
    }

    if (options?.signal?.aborted) {
      return err({ code: 'ABORTED', message: 'Aborted' })
    }

    const buffer = file instanceof File ? await file.arrayBuffer() : file

    if (options?.signal?.aborted) {
      return err({ code: 'ABORTED', message: 'Aborted after read' })
    }

    try {
      const decoder = new TextDecoder('utf-8', { fatal: false })
      const text = decoder.decode(buffer)

      const blocks = parseBlocks(text)

      // Extract title from first H1
      const firstH1 = blocks.find(
        (b): b is HeadingBlock => b.type === 'heading' && b.level === 1
      )
      const titleInline = firstH1?.content[0]
      const title =
        titleInline && 'text' in titleInline
          ? (titleInline as TextInline).text
          : undefined

      return ok({ blocks, meta: { title } })
    } catch (e) {
      return err({ code: 'PARSE_FAILED', message: String(e), source: e })
    }
  },
}
