import type { Adapter } from './Adapter'

export class AdapterRegistry {
  private readonly byExtension = new Map<string, Adapter>()
  private readonly byMime      = new Map<string, Adapter>()

  register(adapter: Adapter): void {
    for (const ext  of adapter.extensions)     this.byExtension.set(ext,  adapter)
    for (const mime of adapter.mimeTypes ?? []) this.byMime.set(mime, adapter)
  }

  unregister(adapterName: string): void {
    for (const [key, a] of this.byExtension) if (a.name === adapterName) this.byExtension.delete(key)
    for (const [key, a] of this.byMime)      if (a.name === adapterName) this.byMime.delete(key)
  }

  resolve(file: File): Adapter | null {
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? ''
    const mime = file.type
    return this.byExtension.get(ext) ?? this.byMime.get(mime) ?? null
  }

  list(): Adapter[] {
    return [...new Set(this.byExtension.values())]
  }
}

export const defaultRegistry = new AdapterRegistry()
