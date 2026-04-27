import { describe, it, expect, beforeEach } from 'vitest'
import { AdapterRegistry } from '../../../src/core/adapter/AdapterRegistry'
import type { Adapter } from '../../../src/core/adapter/Adapter'
import { ok } from '../../../src/core/model/types'

function makeAdapter(name: string, exts: string[], mimes?: string[]): Adapter {
  return {
    name,
    extensions: exts,
    mimeTypes: mimes,
    async parse() { return ok({ blocks: [], meta: {} }) },
  }
}

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry

  beforeEach(() => { registry = new AdapterRegistry() })

  it('resolves adapter by extension', () => {
    const a = makeAdapter('test', ['docx'])
    registry.register(a)
    const file = new File([], 'hello.docx')
    expect(registry.resolve(file)).toBe(a)
  })

  it('resolves adapter by MIME type when extension misses', () => {
    const a = makeAdapter('test', ['xyz'], ['application/test'])
    registry.register(a)
    const file = new File([], 'file.bin', { type: 'application/test' })
    expect(registry.resolve(file)).toBe(a)
  })

  it('returns null for unknown format', () => {
    const file = new File([], 'file.unknownext')
    expect(registry.resolve(file)).toBeNull()
  })

  it('unregister removes all adapter entries', () => {
    const a = makeAdapter('foo', ['foo'], ['application/foo'])
    registry.register(a)
    registry.unregister('foo')
    expect(registry.resolve(new File([], 'file.foo'))).toBeNull()
  })

  it('later-registered adapter overrides earlier for same extension', () => {
    const a1 = makeAdapter('first',  ['pdf'])
    const a2 = makeAdapter('second', ['pdf'])
    registry.register(a1)
    registry.register(a2)
    expect(registry.resolve(new File([], 'f.pdf'))).toBe(a2)
  })
})
