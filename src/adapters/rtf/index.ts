import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Block, Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { stripRTF } from './parser'

const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export const rtfAdapter: Adapter = {
  name: 'rtf',
  extensions: ['rtf', 'rtx'],
  mimeTypes: ['application/rtf', 'text/rtf'],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted before start' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    // Size check
    if (buffer.byteLength > MAX_SIZE) {
      return err({
        code:    'FILE_TOO_LARGE',
        message: `File exceeds 10 MB (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`,
      })
    }

    try {
      // Decode as windows-1252 (latin1 superset); fatal:false means malformed
      // sequences are replaced rather than throwing.
      const decoder = new TextDecoder('windows-1252', { fatal: false })
      let   text    = decoder.decode(buffer)

      // Strip leading BOM (unlikely for windows-1252 but harmless)
      text = text.replace(/^﻿/, '')

      // Validate RTF magic bytes
      if (!text.trimStart().startsWith('{\\rtf')) {
        return err({
          code:    'CORRUPT_FILE',
          message: 'File does not appear to be a valid RTF document (missing {\\rtf header).',
        })
      }

      const paragraphs = stripRTF(text)

      const blocks: Block[] = [
        {
          type: 'unknown',
          raw:  'RTF parsed as plain text — formatting and images are not shown',
        },
      ]

      if (paragraphs.length === 0) {
        blocks.push({ type: 'paragraph', content: [{ type: 'text', text: '(empty document)' }] })
      } else {
        for (const para of paragraphs) {
          blocks.push({ type: 'paragraph', content: [{ type: 'text', text: para }] })
        }
      }

      return ok({ blocks, meta: {} })
    } catch (e) {
      return err({ code: 'PARSE_FAILED', message: String(e), source: e })
    }
  },
}
