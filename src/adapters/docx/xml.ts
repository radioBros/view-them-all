export function parseXml(text: string): Document {
  const parser = new DOMParser()
  return parser.parseFromString(text, 'application/xml')
}

// Namespace-agnostic query: matches elements by local name in any namespace.
// Needed because jsdom XML mode does not match <w:foo> with querySelector('foo').
export function qs(el: Element | Document, localname: string): Element | null {
  const results = el.getElementsByTagNameNS('*', localname)
  return results.length > 0 ? (results[0] ?? null) : null
}

export function qsAll(el: Element | Document, localname: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', localname))
}

// Get attribute from element, trying both 'w:val' and 'val'
export function wAttr(el: Element | null, name: string): string | null {
  if (!el) return null
  return el.getAttribute(`w:${name}`) ?? el.getAttribute(name)
}

// Collect all text from <w:t> nodes within element
export function extractText(el: Element): string {
  return qsAll(el, 't').map(t => t.textContent ?? '').join('')
}
