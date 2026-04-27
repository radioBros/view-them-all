import { describe, it, expect } from 'vitest'
import { mediaAdapter } from '../../../src/adapters/media/index'

const fakeBuffer = () => new Uint8Array(100).buffer

describe('mediaAdapter', () => {
  it('has correct extensions', () => {
    expect(mediaAdapter.extensions).toContain('mp4')
    expect(mediaAdapter.extensions).toContain('mp3')
    expect(mediaAdapter.extensions).toContain('webm')
  })

  it('returns a media-embed block for a video file', async () => {
    const file   = new File([fakeBuffer()], 'clip.mp4')
    const result = await mediaAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const block = result.value.blocks[0] as any
    expect(block.type).toBe('media-embed')
    expect(block.mediaType).toBe('video')
  })

  it('returns a media-embed block for an audio file', async () => {
    const file   = new File([fakeBuffer()], 'song.mp3')
    const result = await mediaAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const block = result.value.blocks[0] as any
    expect(block.type).toBe('media-embed')
    expect(block.mediaType).toBe('audio')
  })

  it('creates an object URL as src', async () => {
    const file   = new File([fakeBuffer()], 'video.webm')
    const result = await mediaAdapter.parse(file)
    if (!result.ok) return
    const block = result.value.blocks[0] as any
    expect(block.src).toBeTruthy()
    expect(typeof block.src).toBe('string')
  })

  it('respects AbortSignal', async () => {
    const ctrl   = new AbortController()
    ctrl.abort()
    const file   = new File([fakeBuffer()], 'audio.wav')
    const result = await mediaAdapter.parse(file, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })
})
