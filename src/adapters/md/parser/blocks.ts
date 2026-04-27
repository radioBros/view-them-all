import type {
  Block,
  HeadingBlock,
  ListBlock,
  ListItem,
  TableBlock,
  TableRow,
  CodeBlock,
  HrBlock,
  ParagraphBlock,
} from '../../../core/model/types'
import { parseInlines } from './inlines'

// ─── Regex patterns ──────────────────────────────────────────────────────────

const ATX_HEADING_RE = /^(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/
const SETEXT_H1_RE = /^=+\s*$/
const SETEXT_H2_RE = /^-+\s*$/
const HR_RE = /^[-*_]{3,}\s*$/
const BLOCKQUOTE_RE = /^>\s?/
const UNORDERED_LIST_RE = /^(\s*)([-*+])\s+(.*)$/
const ORDERED_LIST_RE = /^(\s*)(\d+)\.\s+(.*)$/
const FENCED_CODE_RE = /^(`{3,}|~{3,})\s*(\S*)/
const TABLE_SEP_RE = /^\|?[\s:|-]+\|/

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isBlank(line: string): boolean {
  return line.trim() === ''
}

function makeHeading(level: 1|2|3|4|5|6, rawText: string): HeadingBlock {
  return { type: 'heading', level, content: parseInlines(rawText.trim()) }
}

function makeParagraph(lines: string[]): ParagraphBlock {
  return { type: 'paragraph', content: parseInlines(lines.join(' ')) }
}

// ─── List parsing ─────────────────────────────────────────────────────────────

function parseListItems(
  lines: string[],
  startIndex: number,
  ordered: boolean,
  baseIndent: number
): { block: ListBlock; consumed: number } {
  const items: ListItem[] = []
  let i = startIndex

  while (i < lines.length) {
    const line = lines[i]!
    const ulMatch = UNORDERED_LIST_RE.exec(line)
    const olMatch = ORDERED_LIST_RE.exec(line)

    const isUL = ulMatch && !ordered && (ulMatch[1]?.length ?? 0) === baseIndent
    const isOL = olMatch && ordered && (olMatch[1]?.length ?? 0) === baseIndent

    if (!isUL && !isOL) break

    const rawContent = (ulMatch ?? olMatch)![3]!
    const item: ListItem = { content: parseInlines(rawContent) }

    // Peek ahead for nested items (indented 2+ more spaces)
    const nextLine = lines[i + 1]
    if (nextLine !== undefined) {
      const nextUL = UNORDERED_LIST_RE.exec(nextLine)
      const nextOL = ORDERED_LIST_RE.exec(nextLine)
      const nextMatch = nextUL ?? nextOL
      if (nextMatch) {
        const nextIndent = nextMatch[1]?.length ?? 0
        if (nextIndent >= baseIndent + 2) {
          const nextOrdered = nextOL !== null
          const nested = parseListItems(lines, i + 1, nextOrdered, nextIndent)
          item.children = nested.block
          i += nested.consumed
        }
      }
    }

    items.push(item)
    i++
  }

  return { block: { type: 'list', ordered, items }, consumed: i - startIndex }
}

// ─── Table parsing ────────────────────────────────────────────────────────────

function parseTableRow(line: string, isHeader: boolean): TableRow {
  // Split on | and trim, filtering empty edge cells
  const parts = line.split('|')
  // Remove empty first/last elements caused by leading/trailing |
  const trimmed = parts.map(p => p.trim())
  const cells = (trimmed[0] === '' ? trimmed.slice(1) : trimmed)
  const finalCells = cells[cells.length - 1] === '' ? cells.slice(0, -1) : cells
  return {
    cells: finalCells.map(c => ({ content: parseInlines(c), isHeader })),
  }
}

function tryParseTable(lines: string[], i: number): { block: TableBlock; consumed: number } | null {
  // Need at least 3 lines: header, separator, at least one data row
  if (i + 2 >= lines.length) return null
  const headerLine = lines[i]!
  const sepLine = lines[i + 1]!
  const thirdLine = lines[i + 2]!

  if (!headerLine.includes('|')) return null
  if (!TABLE_SEP_RE.test(sepLine)) return null
  if (!thirdLine.includes('|')) return null

  const rows: TableRow[] = []
  rows.push(parseTableRow(headerLine, true))

  // Consume separator (skip it) and all subsequent data rows
  let j = i + 2
  while (j < lines.length && lines[j]!.includes('|') && !isBlank(lines[j]!)) {
    rows.push(parseTableRow(lines[j]!, false))
    j++
  }

  return { block: { type: 'table', rows }, consumed: j - i }
}

// ─── Main block parser ────────────────────────────────────────────────────────

export function parseBlocks(text: string): Block[] {
  const lines = text.split(/\r?\n/)
  const blocks: Block[] = []
  const paraBuffer: string[] = []
  let i = 0

  function flushParagraph(): void {
    if (paraBuffer.length > 0) {
      blocks.push(makeParagraph([...paraBuffer]))
      paraBuffer.length = 0
    }
  }

  while (i < lines.length) {
    const line = lines[i]!

    // ── Blank line: flush paragraph
    if (isBlank(line)) {
      flushParagraph()
      i++
      continue
    }

    // ── Fenced code block
    const fenceMatch = FENCED_CODE_RE.exec(line)
    if (fenceMatch) {
      flushParagraph()
      const fenceChar = fenceMatch[1]![0]!
      const fenceLen = fenceMatch[1]!.length
      const language = fenceMatch[2] || undefined
      const codeLines: string[] = []
      i++
      while (i < lines.length) {
        const codeLine = lines[i]!
        // Closing fence: same char, same or more length, only fence chars
        if (
          codeLine.startsWith(fenceChar.repeat(fenceLen)) &&
          codeLine.trim().split('').every(c => c === fenceChar)
        ) {
          i++
          break
        }
        codeLines.push(codeLine)
        i++
      }
      const codeBlock: CodeBlock = { type: 'code', code: codeLines.join('\n'), language }
      blocks.push(codeBlock)
      continue
    }

    // ── ATX heading
    const atxMatch = ATX_HEADING_RE.exec(line)
    if (atxMatch) {
      flushParagraph()
      const level = atxMatch[1]!.length as 1|2|3|4|5|6
      blocks.push(makeHeading(level, atxMatch[2]!))
      i++
      continue
    }

    // ── Setext heading: paraBuffer has exactly one line, next line is === or ---
    if (paraBuffer.length > 0) {
      const nextLine = lines[i]
      if (nextLine !== undefined) {
        // Current line IS the underline; the heading text is in paraBuffer
        if (SETEXT_H1_RE.test(line) && line.length >= 2) {
          const headingText = paraBuffer.join(' ')
          paraBuffer.length = 0
          blocks.push(makeHeading(1, headingText))
          i++
          continue
        }
        if (SETEXT_H2_RE.test(line) && line.length >= 2) {
          // Make sure this isn't an HR (no pending para means HR)
          const headingText = paraBuffer.join(' ')
          paraBuffer.length = 0
          blocks.push(makeHeading(2, headingText))
          i++
          continue
        }
      }
    }

    // ── Horizontal rule
    // Dash-only HRs are ambiguous with setext H2 when a paragraph is pending
    // (that case is already handled above). * and _ HRs always interrupt.
    if (HR_RE.test(line)) {
      const isDashHr = /^-+\s*$/.test(line)
      if (!isDashHr || paraBuffer.length === 0) {
        flushParagraph()
        const hrBlock: HrBlock = { type: 'hr' }
        blocks.push(hrBlock)
        i++
        continue
      }
    }

    // ── Blockquote
    if (BLOCKQUOTE_RE.test(line)) {
      flushParagraph()
      const quoteLines: string[] = []
      while (i < lines.length && BLOCKQUOTE_RE.test(lines[i]!) && !isBlank(lines[i]!)) {
        quoteLines.push(lines[i]!.replace(BLOCKQUOTE_RE, ''))
        i++
      }
      blocks.push({ type: 'paragraph', content: parseInlines(quoteLines.join(' ')) })
      continue
    }

    // ── Unordered list
    const ulMatch = UNORDERED_LIST_RE.exec(line)
    if (ulMatch) {
      flushParagraph()
      const baseIndent = ulMatch[1]?.length ?? 0
      const parsed = parseListItems(lines, i, false, baseIndent)
      blocks.push(parsed.block)
      i += parsed.consumed
      continue
    }

    // ── Ordered list
    const olMatch = ORDERED_LIST_RE.exec(line)
    if (olMatch) {
      flushParagraph()
      const baseIndent = olMatch[1]?.length ?? 0
      const parsed = parseListItems(lines, i, true, baseIndent)
      blocks.push(parsed.block)
      i += parsed.consumed
      continue
    }

    // ── GFM table (lookahead)
    const tableResult = tryParseTable(lines, i)
    if (tableResult) {
      flushParagraph()
      blocks.push(tableResult.block)
      i += tableResult.consumed
      continue
    }

    // ── Paragraph accumulation
    paraBuffer.push(line)
    i++
  }

  flushParagraph()

  return blocks
}
