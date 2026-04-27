// Namespace URIs used in OOXML presentation files
export const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

export function parseXml(text: string): Document {
  const parser = new DOMParser()
  return parser.parseFromString(text, 'application/xml')
}

// Namespace-agnostic query: matches elements by local name in any namespace.
// Needed because jsdom XML mode does not match <p:foo> with querySelector('foo').
export function qs(el: Element | Document, localname: string): Element | null {
  const results = el.getElementsByTagNameNS('*', localname)
  return results.length > 0 ? (results[0] ?? null) : null
}

export function qsAll(el: Element | Document, localname: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', localname))
}
