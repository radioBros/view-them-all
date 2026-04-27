import { describe, it, expect, beforeEach } from 'vitest'
import { PreviewEngine } from '../../src/core/engine/PreviewEngine'
import { AdapterRegistry } from '../../src/core/adapter/AdapterRegistry'
import { textCodeAdapter } from '../../src/adapters/text-code/index'

describe('PreviewEngine integration', () => {
  let engine:    PreviewEngine
  let registry:  AdapterRegistry
  let container: HTMLElement

  beforeEach(() => {
    registry  = new AdapterRegistry()
    engine    = new PreviewEngine(registry)
    container = document.createElement('div')
  })

  it('previews a text file end-to-end', async () => {
    registry.register(textCodeAdapter)
    const file   = new File(['console.log("hello")\n'], 'app.js')
    const result = await engine.preview(file, container)
    expect(result.ok).toBe(true)
    expect(container.querySelector('pre')).not.toBeNull()
    expect(container.querySelector('code')).not.toBeNull()
  })

  it('renders error UI for unsupported format', async () => {
    const file   = new File([new ArrayBuffer(10)], 'file.unknownXYZ')
    const result = await engine.preview(file, container)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('UNSUPPORTED_FORMAT')
    expect(container.querySelector('.ufpe-error')).not.toBeNull()
  })

  it('calls hooks in correct order', async () => {
    const calls: string[] = []
    const hookEngine = new PreviewEngine(registry, {
      onParseStart:  () => calls.push('parseStart'),
      onParseEnd:    () => calls.push('parseEnd'),
      onRenderStart: () => calls.push('renderStart'),
      onRenderEnd:   () => calls.push('renderEnd'),
    })
    registry.register(textCodeAdapter)
    await hookEngine.preview(new File(['x'], 'a.txt'), container)
    expect(calls).toEqual(['parseStart', 'parseEnd', 'renderStart', 'renderEnd'])
  })

  it('respects AbortSignal before parse', async () => {
    registry.register(textCodeAdapter)
    const ctrl   = new AbortController()
    ctrl.abort()
    const file   = new File(['x'], 'a.txt')
    const result = await engine.preview(file, container, { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })
})
