export const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

export function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

export function qs(el: Element | Document | null, localname: string): Element | null {
  if (!el) return null
  return (el.getElementsByTagNameNS('*', localname) as HTMLCollectionOf<Element>)[0] ?? null
}

export function qsAll(el: Element | Document | null, localname: string): Element[] {
  if (!el) return []
  return Array.from(el.getElementsByTagNameNS('*', localname))
}

export function attr(el: Element | null, ...names: string[]): string | null {
  if (!el) return null
  for (const n of names) { const v = el.getAttribute(n); if (v !== null) return v }
  return null
}
