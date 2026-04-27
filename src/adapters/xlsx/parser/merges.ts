export type MergeInfo = { colspan: number; rowspan: number } | 'skip'
export type MergeMap  = Map<string, MergeInfo>

function colLettersToNum(col: string): number {
  let n = 0
  for (const ch of col.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64
  return n
}

function parseAddress(addr: string): { r: number; c: number } {
  const m = addr.match(/^([A-Z]+)(\d+)$/i)!
  return { r: parseInt(m[2]!, 10), c: colLettersToNum(m[1]!) }
}

export function buildMergeMap(merges: string[] | undefined): MergeMap {
  const map: MergeMap = new Map()
  if (!merges) return map

  for (const mergeStr of merges) {
    const [startAddr, endAddr] = mergeStr.split(':')
    if (!startAddr || !endAddr) continue
    const start = parseAddress(startAddr)
    const end   = parseAddress(endAddr)

    const colspan = end.c - start.c + 1
    const rowspan = end.r - start.r + 1

    map.set(`${start.r},${start.c}`, { colspan, rowspan })

    for (let r = start.r; r <= end.r; r++) {
      for (let c = start.c; c <= end.c; c++) {
        if (r !== start.r || c !== start.c) map.set(`${r},${c}`, 'skip')
      }
    }
  }

  return map
}
