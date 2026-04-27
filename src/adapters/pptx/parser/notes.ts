import { parseXml, qsAll, qs } from '../xml'
import { parseTxBody } from './run'

/**
 * Parse a notesSlide XML string and return the plain text of the body placeholder.
 * The body placeholder is the <p:sp> where <p:ph type="body"/>.
 */
export function parseNotes(xmlText: string): string {
  try {
    const doc = parseXml(xmlText)
    const shapes = qsAll(doc, 'sp')

    const parts: string[] = []

    for (const sp of shapes) {
      const ph = qs(sp, 'ph')
      // type="body" is the notes content placeholder; also accept no type (body is default)
      const phType = ph?.getAttribute('type') ?? 'body'
      if (phType !== 'body') continue

      const txBody = qs(sp, 'txBody')
      if (!txBody) continue

      const paragraphs = parseTxBody(txBody)
      const text = paragraphs
        .map(p =>
          p.content
            .filter(i => i.type === 'text')
            .map(i => (i as { type: 'text'; text: string }).text)
            .join('')
        )
        .join('\n')
        .trim()

      if (text) parts.push(text)
    }

    return parts.join('\n')
  } catch {
    return ''
  }
}
