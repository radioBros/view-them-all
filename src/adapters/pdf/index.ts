import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Block, Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { registerBlockRenderer } from '../../renderer/extensions'
import { renderPdfEmbed } from './renderer-ext'
import type { PdfEmbedBlock } from './types'

registerBlockRenderer('pdf-embed', (block, container) =>
  renderPdfEmbed(block as PdfEmbedBlock, container)
)

export const pdfAdapter: Adapter = {
  name: 'pdf',
  extensions: ['pdf'],
  mimeTypes: ['application/pdf'],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted before start' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    const objectUrl = URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }))
    const block: PdfEmbedBlock = { type: 'pdf-embed', src: objectUrl }

    return ok({ blocks: [block as unknown as Block] })
  },
}
