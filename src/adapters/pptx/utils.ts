import type JSZip from 'jszip'

export function resolvePath(base: string, relative: string): string {
  if (relative.startsWith('/')) return relative.slice(1)
  const baseDir = base.substring(0, base.lastIndexOf('/'))
  const parts   = `${baseDir}/${relative}`.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '..') out.pop()
    else if (part !== '.') out.push(part)
  }
  return out.join('/')
}

export async function readZipEntry(zip: JSZip, path: string): Promise<string | null> {
  try {
    const file = zip.file(path)
    if (!file) return null
    return await file.async('string')
  } catch {
    return null
  }
}
