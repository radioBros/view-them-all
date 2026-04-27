/**
 * RFC 4180 CSV/TSV parser.
 */

/**
 * Detect the delimiter for a CSV/TSV file by inspecting the first line.
 * Returns '\t' if tabs are more frequent than commas, otherwise ','.
 */
export function detectDelimiter(firstLine: string): string {
  const tabCount   = (firstLine.match(/\t/g)   ?? []).length
  const commaCount = (firstLine.match(/,/g)     ?? []).length
  return tabCount > commaCount ? '\t' : ','
}

/**
 * Parse CSV/TSV text into a 2-D array of strings.
 *
 * RFC 4180 rules:
 *  - Fields may be enclosed in double-quotes.
 *  - A double-quote inside a quoted field is escaped as "".
 *  - Unquoted fields end at the next delimiter or newline.
 *
 * Normalises CRLF/CR to LF and strips a leading UTF-8 BOM before parsing.
 * Stops collecting once maxRows rows have been accumulated.
 */
export function parseCSV(text: string, delimiter: string, maxRows: number): string[][] {
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)

  // Normalise line endings to LF
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Strip trailing newline so we don't emit an empty phantom row
  if (text.endsWith('\n')) text = text.slice(0, -1)

  if (text === '') return []

  const rows: string[][] = []
  let   pos  = 0
  const len  = text.length

  while (pos < len && rows.length < maxRows) {
    const row: string[] = []
    let   endOfRow = false

    while (!endOfRow) {
      let cell = ''

      if (text[pos] === '"') {
        // ── Quoted field ─────────────────────────────────────────────────────
        pos++ // skip opening quote
        while (pos < len) {
          if (text[pos] === '"') {
            if (pos + 1 < len && text[pos + 1] === '"') {
              // Escaped double-quote → literal "
              cell += '"'
              pos  += 2
            } else {
              // Closing quote
              pos++
              break
            }
          } else {
            cell += text[pos]
            pos++
          }
        }
        row.push(cell)
        // Advance past the trailing delimiter or newline
        if (pos < len && text[pos] === delimiter) {
          pos++             // delimiter → more cells follow
        } else {
          // Newline, end-of-input, or anything else → end of row
          if (pos < len && text[pos] === '\n') pos++
          endOfRow = true
        }
      } else {
        // ── Unquoted field ───────────────────────────────────────────────────
        while (pos < len && text[pos] !== delimiter && text[pos] !== '\n') {
          cell += text[pos]
          pos++
        }
        row.push(cell)
        if (pos < len && text[pos] === delimiter) {
          pos++ // delimiter → more cells follow
        } else {
          // Newline or end-of-input → end of row
          if (pos < len && text[pos] === '\n') pos++
          endOfRow = true
        }
      }
    }

    rows.push(row)
  }

  return rows
}
