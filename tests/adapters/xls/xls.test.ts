import { describe, it, expect } from 'vitest'
import { xlsAdapter } from '../../../src/adapters/xls/index'

describe('xlsAdapter', () => {
  it('always returns UNSUPPORTED_FORMAT regardless of file content', async () => {
    const file = new File([new Uint8Array([0xD0, 0xCF, 0x11, 0xE0])], 'test.xls', {
      type: 'application/vnd.ms-excel',
    })
    const result = await xlsAdapter.parse(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNSUPPORTED_FORMAT')
  })
})
