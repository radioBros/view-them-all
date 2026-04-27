const SAFE_SCHEMES = new Set(['https:', 'http:', 'mailto:', 'tel:'])

export function sanitizeHref(href: string): string | null {
  try {
    const url = new URL(href)
    return SAFE_SCHEMES.has(url.protocol) ? href : null
  } catch {
    // Relative URLs are allowed
    if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) {
      return href
    }
    return null
  }
}

export function isObjectUrl(src: string): boolean {
  return src.startsWith('blob:')
}
