import { parseXml, qsAll, attr, REL_NS } from '../xml'

export interface SheetRef {
  name: string
  path: string
}

export function parseWorkbook(
  wbXml: string,
  relsXml: string,
): { sheets: SheetRef[]; is1904: boolean } {
  const wbDoc  = parseXml(wbXml)
  const relDoc = parseXml(relsXml)

  const relMap = new Map<string, string>()
  for (const rel of qsAll(relDoc, 'Relationship')) {
    const id     = attr(rel, 'Id')
    const target = attr(rel, 'Target')
    if (id && target) relMap.set(id, target)
  }

  const workbookPr = wbDoc.getElementsByTagNameNS('*', 'workbookPr')[0] ?? null
  const date1904   = workbookPr?.getAttribute('date1904') ?? ''
  const is1904     = date1904 === '1' || date1904 === 'true'

  const sheets: SheetRef[] = []
  for (const sheet of qsAll(wbDoc, 'sheet')) {
    const name = attr(sheet, 'name') ?? ''
    // r:id is a namespaced attribute in workbook.xml
    const rId  = sheet.getAttributeNS(REL_NS, 'id') ?? attr(sheet, 'r:id') ?? ''
    const target = relMap.get(rId) ?? ''
    if (!target) continue
    const cleaned = target.replace(/^\.\//, '')
    const path    = cleaned.startsWith('xl/') ? cleaned : `xl/${cleaned}`
    sheets.push({ name, path })
  }

  return { sheets, is1904 }
}
