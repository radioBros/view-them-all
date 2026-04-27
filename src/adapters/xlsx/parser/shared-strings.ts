import { parseXml, qsAll, qs } from '../xml'

export function parseSharedStrings(xmlText: string): string[] {
  const doc = parseXml(xmlText)
  return qsAll(doc, 'si').map(si => {
    const runs = qsAll(si, 'r')
    if (runs.length > 0) {
      return runs.map(r => qs(r, 't')?.textContent ?? '').join('')
    }
    return qs(si, 't')?.textContent ?? ''
  })
}
