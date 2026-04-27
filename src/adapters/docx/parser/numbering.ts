import { parseXml, qs, qsAll, wAttr } from '../xml'

export type NumberingInfo = {
  ordered: boolean
}

export type NumberingMap = Map<string, NumberingInfo>

export function parseNumbering(xmlText: string): NumberingMap {
  const map: NumberingMap = new Map()
  try {
    const doc = parseXml(xmlText)

    // Build abstractNumId → ordered mapping
    const abstractNums = new Map<string, boolean>()
    for (const abs of qsAll(doc, 'abstractNum')) {
      const id   = wAttr(abs, 'abstractNumId') ?? ''
      const lvl0 = qs(abs, 'lvl')
      const fmt  = lvl0 ? wAttr(qs(lvl0, 'numFmt'), 'val') : null
      abstractNums.set(id, fmt !== 'bullet')
    }

    // Map numId → ordered via abstractNumId reference
    for (const num of qsAll(doc, 'num')) {
      const numId   = wAttr(num, 'numId') ?? ''
      const absRef  = qs(num, 'abstractNumId')
      const absId   = wAttr(absRef, 'val') ?? ''
      const ordered = abstractNums.get(absId) ?? false
      if (numId) map.set(numId, { ordered })
    }
  } catch {
    // Non-fatal
  }
  return map
}
