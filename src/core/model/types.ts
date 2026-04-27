// ─── Inline ──────────────────────────────────────────────────────────────────

export type TextInline = {
  type: 'text'
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  code?: boolean
  color?: string          // hex color string, e.g. "#FF0000"
  fontSize?: number       // in points
  fontFamily?: string     // e.g. "Calibri", "Arial"
}

export type LinkInline = {
  type: 'link'
  text: string
  href: string            // sanitized at adapter level; renderer must re-validate
}

export type ImageInline = {
  type: 'image-inline'   // distinct from block-level image
  src: string
  alt?: string
  width?: number
  height?: number
}

export type UnknownInline = {
  type: 'unknown-inline'
  raw?: string
}

export type Inline =
  | TextInline
  | LinkInline
  | ImageInline
  | UnknownInline

// ─── Block ───────────────────────────────────────────────────────────────────

export type ParagraphBlock = {
  type: 'paragraph'
  content: Inline[]
}

export type HeadingBlock = {
  type: 'heading'
  level: 1 | 2 | 3 | 4 | 5 | 6
  content: Inline[]
}

export type ListBlock = {
  type: 'list'
  ordered: boolean
  items: ListItem[]
}

export type ListItem = {
  content: Inline[]
  children?: ListBlock
}

export type TableCell = {
  content: Inline[]
  isHeader: boolean
  colspan?: number
  rowspan?: number
  backgroundColor?: string
}

export type TableRow = {
  cells: TableCell[]
}

export type TableBlock = {
  type: 'table'
  rows: TableRow[]
  caption?: string
}

export type ImageBlock = {
  type: 'image'
  src: string
  alt?: string
  width?: number
  height?: number
  caption?: string
}

export type CodeBlock = {
  type: 'code'
  code: string
  language?: string
}

export type HrBlock = {
  type: 'hr'
}

export type SlideParagraph = {
  content: Inline[]
  align?: 'left' | 'center' | 'right' | 'justify'
  bullet?: string    // bullet character or auto-number text, e.g. "•", "1."
  indent?: number    // indent level (0-based) for bullet lists
}

export type SlideElement =
  | {
      type: 'text'
      x: number
      y: number
      width: number
      height: number
      paragraphs: SlideParagraph[]
      backgroundColor?: string
      verticalAlign?: 'top' | 'middle' | 'bottom'
    }
  | {
      type: 'image'
      x: number
      y: number
      width: number
      height: number
      src: string
      alt?: string
    }
  | {
      type: 'table'
      x: number
      y: number
      width: number
      height: number
      rows: TableRow[]
    }

export type SlideBlock = {
  type: 'slide'
  index: number
  canvasWidth: number
  canvasHeight: number
  background?: string
  elements: SlideElement[]
  notes?: string
  rawHtml?: string
}

export type UnknownBlock = {
  type: 'unknown'
  raw?: string
}

export type Block =
  | ParagraphBlock
  | HeadingBlock
  | ListBlock
  | TableBlock
  | ImageBlock
  | CodeBlock
  | HrBlock
  | SlideBlock
  | UnknownBlock

// ─── Document ─────────────────────────────────────────────────────────────────

export type DocumentMeta = {
  title?: string
  author?: string
  created?: Date
  modified?: Date
  subject?: string
  keywords?: string[]
  pageCount?: number
  slideCount?: number
  sheetNames?: string[]
  language?: string
}

export type DocumentModel = {
  blocks: Block[]
  meta?: DocumentMeta
}

// ─── Result type (no throws across module boundaries) ─────────────────────────

export type ParseError = {
  code:
    | 'UNSUPPORTED_FORMAT'
    | 'CORRUPT_FILE'
    | 'PARSE_FAILED'
    | 'ABORTED'
    | 'FILE_TOO_LARGE'
    | 'UNKNOWN'
  message: string
  source?: unknown
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ParseError }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err(error: ParseError): Result<never> {
  return { ok: false, error }
}
