import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Block, Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { registerBlockRenderer } from '../../renderer/extensions'
import { getMimeType } from '../../shared/mime'

export type MediaEmbedBlock = {
  type:      'media-embed'
  src:       string
  mediaType: 'video' | 'audio'
  mimeType:  string
}

const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv'])

// Register renderer extension once on import
registerBlockRenderer('media-embed', (block, container) => {
  renderMediaEmbed(block as MediaEmbedBlock, container)
})

export function renderMediaEmbed(block: MediaEmbedBlock, container: HTMLElement): void {
  const el = document.createElement(block.mediaType) as HTMLVideoElement | HTMLAudioElement
  el.className = `ufpe-media-${block.mediaType}`
  el.controls  = true
  el.setAttribute('src', block.src)

  if (!el.canPlayType(block.mimeType)) {
    const notice = document.createElement('p')
    notice.className   = 'ufpe-media-unsupported'
    notice.textContent = `This browser cannot play ${block.mimeType} files.`
    container.appendChild(notice)
    return
  }

  container.appendChild(el)
}

export const mediaAdapter: Adapter = {
  name: 'media',
  extensions: ['mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'],
  mimeTypes: ['video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/ogg'],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted' })

    const buffer   = file instanceof File ? await file.arrayBuffer() : file
    const name     = file instanceof File ? file.name : 'media'
    const ext      = name.split('.').pop()?.toLowerCase() ?? ''
    const mimeType = getMimeType(name)
    const isVideo  = VIDEO_EXTS.has(ext)
    const src      = URL.createObjectURL(new Blob([buffer], { type: mimeType }))

    const block: MediaEmbedBlock = {
      type:      'media-embed',
      src,
      mediaType: isVideo ? 'video' : 'audio',
      mimeType,
    }

    return ok({ blocks: [block as unknown as Block], meta: {} })
  },
}
