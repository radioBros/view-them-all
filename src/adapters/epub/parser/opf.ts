import { qs, qsAll } from '../xml'

export type OpfResult = {
  spine:    string[]               // ordered list of content file paths (absolute within ZIP)
  manifest: Map<string, string>    // id → href (resolved)
  title?:   string
  author?:  string
  language?: string
  opfDir:   string                 // directory containing OPF file (for resolving relative paths)
}

// Internal map: id → { href, mediaType } for spine filtering
type ManifestItem = { href: string; mediaType: string }

export function parseOpf(xml: Document, opfPath: string): OpfResult {
  const opfDir = opfPath.includes('/')
    ? opfPath.split('/').slice(0, -1).join('/')
    : ''

  // Build internal manifest with mediaType
  const itemsMap = new Map<string, ManifestItem>()
  for (const item of qsAll(xml, 'item')) {
    const id        = item.getAttribute('id')
    const href      = item.getAttribute('href')
    const mediaType = item.getAttribute('media-type') ?? ''
    if (!id || !href) continue
    const resolvedHref = opfDir ? `${opfDir}/${href}` : href
    itemsMap.set(id, { href: resolvedHref, mediaType })
  }

  // Public manifest: id → href only
  const manifest = new Map<string, string>()
  for (const [id, { href }] of itemsMap) {
    manifest.set(id, href)
  }

  // Spine: ordered idref → resolved href (only HTML/XHTML items)
  const CONTENT_TYPES = new Set([
    'text/html',
    'application/xhtml+xml',
    'application/x-dtbook+xml',
  ])

  const spine: string[] = []
  for (const itemref of qsAll(xml, 'itemref')) {
    const idref = itemref.getAttribute('idref')
    if (!idref) continue
    const item = itemsMap.get(idref)
    if (!item) continue
    if (!CONTENT_TYPES.has(item.mediaType)) continue
    spine.push(item.href)
  }

  // Metadata
  const title    = qs(xml, 'title')?.textContent?.trim()   || undefined
  const author   = qs(xml, 'creator')?.textContent?.trim() || undefined
  const language = qs(xml, 'language')?.textContent?.trim() || undefined

  return { spine, manifest, title, author, language, opfDir }
}
