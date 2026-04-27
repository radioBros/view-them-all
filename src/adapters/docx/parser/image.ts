import type JSZip from 'jszip'
import type { RelMap } from './relationships'
import { getMimeType } from '../../../shared/mime'

export async function resolveImageObjectUrl(
  rId: string,
  rels: RelMap,
  zip: JSZip,
  signal?: AbortSignal
): Promise<string | null> {
  if (signal?.aborted) return null

  const rel = rels.get(rId)
  if (!rel) return null

  const target = rel.target.replace(/^\.\.\//, '')  // strip leading ../
  const path   = `word/${target}`

  try {
    const data = await zip.file(path)?.async('arraybuffer')
    if (!data) return null

    const mime = getMimeType(path)
    const blob = new Blob([data], { type: mime })
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}
