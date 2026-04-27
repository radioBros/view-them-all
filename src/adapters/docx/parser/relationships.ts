import { parseXml, qsAll, wAttr } from '../xml'

export type RelEntry = {
  type:   string
  target: string
}

export type RelMap = Map<string, RelEntry>

export function parseRelationships(xmlText: string): RelMap {
  const map: RelMap = new Map()
  try {
    const doc = parseXml(xmlText)
    for (const rel of qsAll(doc, 'Relationship')) {
      const id     = rel.getAttribute('Id') ?? ''
      const type   = rel.getAttribute('Type') ?? ''
      const target = rel.getAttribute('Target') ?? ''
      if (id) map.set(id, { type, target })
    }
  } catch {
    // Missing rels file is non-fatal
  }
  return map
}
