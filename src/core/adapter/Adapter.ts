import type { DocumentModel, Result } from '../model/types'

export type ParseOptions = {
  signal?: AbortSignal
  sheetIndex?: number      // XLSX: 0-based sheet index (default 0)
  maxImageBytes?: number   // skip images larger than this (default: no limit)
  config?: unknown         // adapter-specific render config passed through from engine.preview()
}

export interface Adapter {
  readonly name: string
  readonly extensions: readonly string[]   // lowercase, no leading dot
  readonly mimeTypes?: readonly string[]

  parse(
    file: File | ArrayBuffer,
    options?: ParseOptions
  ): Promise<Result<DocumentModel>>
}
