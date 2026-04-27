import { describe, it, expect } from 'vitest'
import { pdfAdapter } from '../../../src/adapters/pdf/index'

describe('pdfAdapter', () => {
  it('has correct extensions and MIME types', () => {
    expect(pdfAdapter.extensions).toContain('pdf')
    expect(pdfAdapter.mimeTypes).toContain('application/pdf')
  })

  it('returns a pdf-embed block for any bytes', async () => {
    const buf    = new Uint8Array(256).fill(0xFF)
    const file   = new File([buf], 'arbitrary.pdf')
    const result = await pdfAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const block = result.value.blocks[0] as any
      expect(block.type).toBe('pdf-embed')
      expect(typeof block.src).toBe('string')
    }
  })

  it('respects AbortSignal', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const file   = new File([new Uint8Array(100)], 'test.pdf')
    const result = await pdfAdapter.parse(file, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  it('returns a blob object URL as src', async () => {
    const file   = new File([new Uint8Array(64)], 'test.pdf')
    const result = await pdfAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const block = result.value.blocks[0] as any
      expect(block.src).toMatch(/^blob:/)
    }
  })
})
