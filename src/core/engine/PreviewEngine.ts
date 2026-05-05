import type { AdapterRegistry } from '../adapter/AdapterRegistry'
import type { DocumentModel, ParseError, Result } from '../model/types'
import type { ParseOptions } from '../adapter/Adapter'
import { err } from '../model/types'
import { defaultRegistry } from '../adapter/AdapterRegistry'
import { mount, unmount } from '../../renderer/Container'
import { renderError } from '../../renderer/renderError'

export type EngineHooks = {
  onParseStart?:  (file: File) => void
  onParseEnd?:    (result: Result<DocumentModel>) => void
  onRenderStart?: () => void
  onRenderEnd?:   () => void
}

export class PreviewEngine {
  constructor(
    private readonly registry: AdapterRegistry = defaultRegistry,
    private readonly hooks: EngineHooks = {}
  ) {}

  async preview(
    file: File,
    container: HTMLElement,
    options?: ParseOptions | null,
    config?: unknown
  ): Promise<Result<DocumentModel>> {
    this.hooks.onParseStart?.(file)

    const adapter = this.registry.resolve(file)
    if (!adapter) {
      const error: ParseError = { code: 'UNSUPPORTED_FORMAT', message: `No adapter registered for "${file.name}"` }
      const result = err(error)
      this.hooks.onParseEnd?.(result)
      renderError(error, container)
      return result
    }

    const opts: ParseOptions | undefined = options ?? undefined
    const result = await adapter.parse(file, config !== undefined ? { ...opts, config } : opts)
    this.hooks.onParseEnd?.(result)

    if (!result.ok) {
      renderError(result.error, container)
      return result
    }

    this.hooks.onRenderStart?.()
    mount(container, result.value)
    this.hooks.onRenderEnd?.()

    return result
  }

  destroy(container: HTMLElement): void {
    unmount(container)
  }
}

export const engine = new PreviewEngine()

export function registerAdapter(adapter: import('../adapter/Adapter').Adapter): void {
  defaultRegistry.register(adapter)
}

export async function preview(
  file: File,
  container: HTMLElement,
  options?: ParseOptions | null,
  config?: unknown
): Promise<Result<DocumentModel>> {
  return engine.preview(file, container, options, config)
}

export { unmount } from '../../renderer/Container'
