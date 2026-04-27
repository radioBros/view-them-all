export function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, 'application/xml')
}

export function qs(el: Element | Document, localname: string): Element | null {
  return (el.getElementsByTagNameNS('*', localname) as HTMLCollectionOf<Element>)[0] ?? null
}

export function qsAll(el: Element | Document, localname: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', localname))
}
