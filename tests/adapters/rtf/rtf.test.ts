import { describe, it, expect } from 'vitest'
import { rtfAdapter } from '../../../src/adapters/rtf/index'

/**
 * Build a minimal valid RTF ArrayBuffer from an array of plain-text paragraphs.
 * Each paragraph is separated by \par (with a trailing space so the control word
 * is properly terminated before the next one starts).
 */
function makeRtfBuffer(paragraphs: string[]): ArrayBuffer {
  const body = paragraphs.join('\\par ')
  const rtf  = `{\\rtf1\\ansi ${body}\\par}`
  return new TextEncoder().encode(rtf).buffer
}

describe('rtfAdapter', () => {
  it('extracts paragraphs from a simple RTF document', async () => {
    const buf    = makeRtfBuffer(['Hello world', 'Second paragraph'])
    const result = await rtfAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // First block is the notice; subsequent blocks are paragraphs
    const paras = result.value.blocks.filter((b: any) => b.type === 'paragraph')
    expect(paras.length).toBeGreaterThanOrEqual(2)
    const texts = paras.map((p: any) => p.content[0]?.text ?? '')
    expect(texts).toContain('Hello world')
    expect(texts).toContain('Second paragraph')
  })

  it('returns CORRUPT_FILE for a buffer that does not start with {\\rtf', async () => {
    const bad    = new TextEncoder().encode('PK\x03\x04notanrtf').buffer
    const result = await rtfAdapter.parse(bad)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('CORRUPT_FILE')
  })

  it('decodes \\uN? Unicode escapes', async () => {
    // RTF: \u916? is the Unicode codepoint for 'Δ' (U+0394 = 916)
    const rtf  = `{\\rtf1\\ansi \\u916?\\par}`
    const buf  = new TextEncoder().encode(rtf).buffer
    const result = await rtfAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paras = result.value.blocks.filter((b: any) => b.type === 'paragraph')
    const allText = paras.map((p: any) => p.content[0]?.text ?? '').join('')
    expect(allText).toContain('Δ') // Δ
  })

  it('respects AbortSignal', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const buf    = makeRtfBuffer(['Hello'])
    const result = await rtfAdapter.parse(buf, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })

  it('strips RTF control words and leaves only plain text', async () => {
    // RTF with bold/italic control words
    const rtf    = `{\\rtf1\\ansi {\\b Bold text}\\par {\\i Italic text}\\par}`
    const buf    = new TextEncoder().encode(rtf).buffer
    const result = await rtfAdapter.parse(buf)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paras = result.value.blocks.filter((b: any) => b.type === 'paragraph')
    const texts = paras.map((p: any) => p.content[0]?.text ?? '')
    // Control words stripped; plain text preserved
    expect(texts.some((t: string) => t.includes('Bold text'))).toBe(true)
    expect(texts.some((t: string) => t.includes('Italic text'))).toBe(true)
  })
})
