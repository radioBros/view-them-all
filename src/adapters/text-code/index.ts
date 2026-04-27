import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Block, Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { detectLanguage } from './languages'

const MAX_SIZE_BYTES = 10 * 1024 * 1024   // 10 MB
const TRUNCATE_BYTES = 500 * 1024          // 500 KB

export const textCodeAdapter: Adapter = {
  name: 'text-code',
  extensions: [
    'txt', 'md', 'mdx',
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'go', 'rs', 'java', 'c', 'h',
    'cpp', 'cc', 'cxx', 'hpp', 'cs', 'rb', 'php', 'swift', 'kt', 'kts',
    'css', 'scss', 'sass', 'html', 'htm', 'xml',
    'json', 'yaml', 'yml', 'toml', 'sh', 'bash', 'zsh', 'sql', 'graphql',
    'log', 'logs',
  ],
  mimeTypes: ['text/plain', 'text/html', 'application/json', 'application/xml', 'text/markdown'],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    const size = file instanceof File ? file.size : file.byteLength
    const name = file instanceof File ? file.name : ''

    if (size > MAX_SIZE_BYTES) {
      return err({
        code: 'FILE_TOO_LARGE',
        message: `File exceeds 10 MB (${(size / 1024 / 1024).toFixed(1)} MB)`,
      })
    }

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    try {
      const decoder = new TextDecoder('utf-8', { fatal: false })
      const blocks: Block[] = []
      let truncated = false
      let text: string

      if (buffer.byteLength > TRUNCATE_BYTES) {
        const truncBuffer = buffer.slice(0, TRUNCATE_BYTES)
        let truncText = decoder.decode(truncBuffer)
        const lastNewline = truncText.lastIndexOf('\n')
        if (lastNewline > 0) truncText = truncText.slice(0, lastNewline)
        text = truncText
        truncated = true
      } else {
        text = decoder.decode(buffer)
      }

      const language = detectLanguage(name)
      blocks.push({ type: 'code', code: text, language })

      if (truncated) {
        blocks.push({
          type: 'unknown',
          raw: 'File truncated at 500 KB for performance. Download the file to view the full content.',
        })
      }

      return ok({ blocks, meta: {} })
    } catch (e) {
      return err({ code: 'PARSE_FAILED', message: String(e), source: e })
    }
  },
}
