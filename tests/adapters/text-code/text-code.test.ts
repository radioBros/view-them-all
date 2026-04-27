import { describe, it, expect } from 'vitest'
import { textCodeAdapter } from '../../../src/adapters/text-code/index'
import { detectLanguage } from '../../../src/adapters/text-code/languages'

describe('textCodeAdapter', () => {
  it('parses a simple text file', async () => {
    const file   = new File(['Hello world\n'], 'hello.txt', { type: 'text/plain' })
    const result = await textCodeAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.blocks[0]!.type).toBe('code')
    if (result.value.blocks[0]!.type === 'code') {
      expect(result.value.blocks[0]!.code).toBe('Hello world\n')
    }
  })

  it('detects TypeScript language', async () => {
    const file   = new File(['const x = 1'], 'app.ts')
    const result = await textCodeAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    if (result.value.blocks[0]!.type === 'code') {
      expect(result.value.blocks[0]!.language).toBe('typescript')
    }
  })

  it('detects JSON language', async () => {
    const file   = new File(['{}'], 'config.json')
    const result = await textCodeAdapter.parse(file)
    if (!result.ok) return
    if (result.value.blocks[0]!.type === 'code') {
      expect(result.value.blocks[0]!.language).toBe('json')
    }
  })

  it('returns FILE_TOO_LARGE for files > 10 MB', async () => {
    const big = new Uint8Array(11 * 1024 * 1024)
    const file = new File([big], 'big.txt')
    const result = await textCodeAdapter.parse(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FILE_TOO_LARGE')
  })

  it('truncates files > 500 KB and appends unknown notice', async () => {
    const big = 'x'.repeat(600 * 1024)
    const file = new File([big], 'big.txt')
    const result = await textCodeAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.blocks.length).toBe(2)
    expect(result.value.blocks[1]!.type).toBe('unknown')
  })

  it('respects AbortSignal', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const file   = new File(['hello'], 'test.txt')
    const result = await textCodeAdapter.parse(file, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })
})

describe('detectLanguage', () => {
  it('maps common extensions', () => {
    expect(detectLanguage('app.ts')).toBe('typescript')
    expect(detectLanguage('script.py')).toBe('python')
    expect(detectLanguage('app.go')).toBe('go')
    expect(detectLanguage('README.md')).toBe('markdown')
    expect(detectLanguage('style.css')).toBe('css')
    expect(detectLanguage('data.json')).toBe('json')
    expect(detectLanguage('hello.rs')).toBe('rust')
    expect(detectLanguage('unknown.xyz')).toBeUndefined()
  })
})
