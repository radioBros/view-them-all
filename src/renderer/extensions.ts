type BlockRendererFn = (block: unknown, container: HTMLElement) => void

const registry = new Map<string, BlockRendererFn>()

export function registerBlockRenderer(type: string, fn: BlockRendererFn): void {
  registry.set(type, fn)
}

export function getBlockRenderer(type: string): BlockRendererFn | undefined {
  return registry.get(type)
}
