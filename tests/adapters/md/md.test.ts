import { describe, it, expect } from 'vitest'
import { mdAdapter } from '../../../src/adapters/md/index'
import type {
  HeadingBlock,
  ParagraphBlock,
  CodeBlock,
  ListBlock,
  TableBlock,
  HrBlock,
  TextInline,
  LinkInline,
  ImageInline,
} from '../../../src/core/model/types'

function mkFile(content: string, name = 'test.md'): File {
  return new File([content], name, { type: 'text/markdown' })
}

// ─── ATX Headings ─────────────────────────────────────────────────────────────

describe('ATX headings', () => {
  it('parses h1 through h6', async () => {
    const md = [
      '# Heading 1',
      '## Heading 2',
      '### Heading 3',
      '#### Heading 4',
      '##### Heading 5',
      '###### Heading 6',
    ].join('\n')
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const headings = result.value.blocks.filter(b => b.type === 'heading') as HeadingBlock[]
    expect(headings).toHaveLength(6)
    for (let i = 0; i < 6; i++) {
      expect(headings[i]!.level).toBe(i + 1)
      expect((headings[i]!.content[0] as TextInline).text).toBe(`Heading ${i + 1}`)
    }
  })

  it('strips trailing # from ATX heading', async () => {
    const result = await mdAdapter.parse(mkFile('# Title ##'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const h = result.value.blocks[0] as HeadingBlock
    expect(h.type).toBe('heading')
    expect(h.level).toBe(1)
    expect((h.content[0] as TextInline).text).toBe('Title')
  })
})

// ─── Setext Headings ──────────────────────────────────────────────────────────

describe('Setext headings', () => {
  it('parses === as H1', async () => {
    const result = await mdAdapter.parse(mkFile('My Title\n========'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const h = result.value.blocks[0] as HeadingBlock
    expect(h.type).toBe('heading')
    expect(h.level).toBe(1)
    expect((h.content[0] as TextInline).text).toBe('My Title')
  })

  it('parses --- as H2', async () => {
    const result = await mdAdapter.parse(mkFile('Subtitle\n--------'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const h = result.value.blocks[0] as HeadingBlock
    expect(h.type).toBe('heading')
    expect(h.level).toBe(2)
    expect((h.content[0] as TextInline).text).toBe('Subtitle')
  })
})

// ─── Paragraphs with inline formatting ────────────────────────────────────────

describe('Paragraphs with inline formatting', () => {
  it('parses plain paragraph', async () => {
    const result = await mdAdapter.parse(mkFile('Hello world'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    expect(p.type).toBe('paragraph')
    expect((p.content[0] as TextInline).text).toBe('Hello world')
  })

  it('parses bold with **', async () => {
    const result = await mdAdapter.parse(mkFile('before **bold** after'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const boldInline = p.content.find(i => i.type === 'text' && (i as TextInline).bold) as TextInline
    expect(boldInline).toBeDefined()
    expect(boldInline.text).toBe('bold')
  })

  it('parses bold with __', async () => {
    const result = await mdAdapter.parse(mkFile('__bold__'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const boldInline = p.content.find(i => i.type === 'text' && (i as TextInline).bold) as TextInline
    expect(boldInline).toBeDefined()
    expect(boldInline.text).toBe('bold')
  })

  it('parses italic with *', async () => {
    const result = await mdAdapter.parse(mkFile('*italic*'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const italicInline = p.content.find(i => i.type === 'text' && (i as TextInline).italic) as TextInline
    expect(italicInline).toBeDefined()
    expect(italicInline.text).toBe('italic')
  })

  it('parses italic with _', async () => {
    const result = await mdAdapter.parse(mkFile('_italic_'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const italicInline = p.content.find(i => i.type === 'text' && (i as TextInline).italic) as TextInline
    expect(italicInline).toBeDefined()
    expect(italicInline.text).toBe('italic')
  })

  it('parses bold+italic with ***', async () => {
    const result = await mdAdapter.parse(mkFile('***both***'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const inline = p.content[0] as TextInline
    expect(inline.bold).toBe(true)
    expect(inline.italic).toBe(true)
    expect(inline.text).toBe('both')
  })

  it('parses bold+italic with ___', async () => {
    const result = await mdAdapter.parse(mkFile('___both___'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const inline = p.content[0] as TextInline
    expect(inline.bold).toBe(true)
    expect(inline.italic).toBe(true)
    expect(inline.text).toBe('both')
  })

  it('parses strikethrough', async () => {
    const result = await mdAdapter.parse(mkFile('~~struck~~'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const inline = p.content[0] as TextInline
    expect(inline.strikethrough).toBe(true)
    expect(inline.text).toBe('struck')
  })
})

// ─── Inline code and fenced code blocks ───────────────────────────────────────

describe('Inline code', () => {
  it('parses backtick inline code', async () => {
    const result = await mdAdapter.parse(mkFile('Use `console.log()` here'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const codeInline = p.content.find(i => i.type === 'text' && (i as TextInline).code) as TextInline
    expect(codeInline).toBeDefined()
    expect(codeInline.text).toBe('console.log()')
  })
})

describe('Fenced code blocks', () => {
  it('parses ``` fenced code block with language', async () => {
    const md = '```typescript\nconst x = 1\n```'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const code = result.value.blocks[0] as CodeBlock
    expect(code.type).toBe('code')
    expect(code.language).toBe('typescript')
    expect(code.code).toBe('const x = 1')
  })

  it('parses ~~~ fenced code block with language', async () => {
    const md = '~~~python\nprint("hello")\n~~~'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const code = result.value.blocks[0] as CodeBlock
    expect(code.type).toBe('code')
    expect(code.language).toBe('python')
    expect(code.code).toBe('print("hello")')
  })

  it('parses fenced code block without language', async () => {
    const md = '```\nsome code\n```'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const code = result.value.blocks[0] as CodeBlock
    expect(code.type).toBe('code')
    expect(code.language).toBeUndefined()
    expect(code.code).toBe('some code')
  })

  it('preserves multiline code content', async () => {
    const md = '```\nline one\nline two\nline three\n```'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const code = result.value.blocks[0] as CodeBlock
    expect(code.code).toBe('line one\nline two\nline three')
  })
})

// ─── Unordered lists ──────────────────────────────────────────────────────────

describe('Unordered lists', () => {
  it('parses - list items', async () => {
    const md = '- item one\n- item two\n- item three'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const list = result.value.blocks[0] as ListBlock
    expect(list.type).toBe('list')
    expect(list.ordered).toBe(false)
    expect(list.items).toHaveLength(3)
    expect((list.items[0]!.content[0] as TextInline).text).toBe('item one')
  })

  it('parses * list items', async () => {
    const md = '* alpha\n* beta'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const list = result.value.blocks[0] as ListBlock
    expect(list.ordered).toBe(false)
    expect(list.items).toHaveLength(2)
  })

  it('parses + list items', async () => {
    const md = '+ first\n+ second'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const list = result.value.blocks[0] as ListBlock
    expect(list.ordered).toBe(false)
    expect(list.items).toHaveLength(2)
  })
})

// ─── Ordered lists ────────────────────────────────────────────────────────────

describe('Ordered lists', () => {
  it('parses numbered list items', async () => {
    const md = '1. first\n2. second\n3. third'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const list = result.value.blocks[0] as ListBlock
    expect(list.type).toBe('list')
    expect(list.ordered).toBe(true)
    expect(list.items).toHaveLength(3)
    expect((list.items[0]!.content[0] as TextInline).text).toBe('first')
    expect((list.items[2]!.content[0] as TextInline).text).toBe('third')
  })
})

// ─── Nested lists ─────────────────────────────────────────────────────────────

describe('Nested lists', () => {
  it('parses one level of unordered nesting', async () => {
    const md = '- parent\n  - child one\n  - child two\n- next parent'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const list = result.value.blocks[0] as ListBlock
    expect(list.items).toHaveLength(2)
    const firstItem = list.items[0]!
    expect(firstItem.children).toBeDefined()
    expect(firstItem.children!.items).toHaveLength(2)
    expect((firstItem.children!.items[0]!.content[0] as TextInline).text).toBe('child one')
    expect((firstItem.children!.items[1]!.content[0] as TextInline).text).toBe('child two')
  })

  it('parses one level of ordered nesting', async () => {
    const md = '1. parent\n   1. nested\n2. second parent'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const list = result.value.blocks[0] as ListBlock
    expect(list.ordered).toBe(true)
    expect(list.items).toHaveLength(2)
  })
})

// ─── GFM Tables ───────────────────────────────────────────────────────────────

describe('GFM tables', () => {
  it('parses a simple GFM table', async () => {
    const md = '| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const table = result.value.blocks[0] as TableBlock
    expect(table.type).toBe('table')
    expect(table.rows).toHaveLength(3) // header + 2 data rows
    // Header row
    expect(table.rows[0]!.cells[0]!.isHeader).toBe(true)
    expect((table.rows[0]!.cells[0]!.content[0] as TextInline).text).toBe('Name')
    expect((table.rows[0]!.cells[1]!.content[0] as TextInline).text).toBe('Age')
    // Data rows
    expect(table.rows[1]!.cells[0]!.isHeader).toBe(false)
    expect((table.rows[1]!.cells[0]!.content[0] as TextInline).text).toBe('Alice')
    expect((table.rows[2]!.cells[0]!.content[0] as TextInline).text).toBe('Bob')
  })

  it('parses table with alignment separators', async () => {
    const md = '| Left | Center | Right |\n|:-----|:------:|------:|\n| a | b | c |'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const table = result.value.blocks[0] as TableBlock
    expect(table.type).toBe('table')
    expect(table.rows[0]!.cells).toHaveLength(3)
  })
})

// ─── Horizontal rules ─────────────────────────────────────────────────────────

describe('Horizontal rules', () => {
  it('parses --- as hr', async () => {
    const result = await mdAdapter.parse(mkFile('---'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const hr = result.value.blocks[0] as HrBlock
    expect(hr.type).toBe('hr')
  })

  it('parses *** as hr', async () => {
    const result = await mdAdapter.parse(mkFile('***'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const hr = result.value.blocks[0] as HrBlock
    expect(hr.type).toBe('hr')
  })

  it('parses ___ as hr', async () => {
    const result = await mdAdapter.parse(mkFile('___'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const hr = result.value.blocks[0] as HrBlock
    expect(hr.type).toBe('hr')
  })

  it('does not treat setext --- as hr when preceded by text', async () => {
    const result = await mdAdapter.parse(mkFile('Some heading\n---'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const h = result.value.blocks[0] as HeadingBlock
    expect(h.type).toBe('heading')
    expect(h.level).toBe(2)
  })

  it('*** interrupts a paragraph and emits hr', async () => {
    const md = 'before\n***\nafter'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.blocks).toHaveLength(3)
    expect(result.value.blocks[0]!.type).toBe('paragraph')
    expect(result.value.blocks[1]!.type).toBe('hr')
    expect(result.value.blocks[2]!.type).toBe('paragraph')
  })

  it('___ interrupts a paragraph and emits hr', async () => {
    const md = 'before\n___\nafter'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.blocks).toHaveLength(3)
    expect(result.value.blocks[1]!.type).toBe('hr')
  })
})

// ─── Blockquotes ──────────────────────────────────────────────────────────────

describe('Blockquotes', () => {
  it('parses single-line blockquote', async () => {
    const result = await mdAdapter.parse(mkFile('> This is a quote'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    expect(p.type).toBe('paragraph')
    expect((p.content[0] as TextInline).text).toBe('This is a quote')
  })

  it('parses multi-line blockquote as paragraph', async () => {
    const md = '> Line one\n> Line two'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    expect(p.type).toBe('paragraph')
    const text = p.content.map(i => (i as TextInline).text).join('')
    expect(text).toContain('Line one')
    expect(text).toContain('Line two')
  })
})

// ─── Links ────────────────────────────────────────────────────────────────────

describe('Links', () => {
  it('parses markdown link', async () => {
    const result = await mdAdapter.parse(mkFile('[Google](https://google.com)'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const link = p.content[0] as LinkInline
    expect(link.type).toBe('link')
    expect(link.text).toBe('Google')
    expect(link.href).toBe('https://google.com')
  })

  it('rejects javascript: links', async () => {
    const result = await mdAdapter.parse(mkFile('[Click](javascript:alert(1))'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    // Should NOT produce a link inline
    const hasLink = p.content.some(i => i.type === 'link')
    expect(hasLink).toBe(false)
  })

  it('rejects JAVASCRIPT: links (case-insensitive)', async () => {
    const result = await mdAdapter.parse(mkFile('[XSS](JAVASCRIPT:alert(1))'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const hasLink = p.content.some(i => i.type === 'link')
    expect(hasLink).toBe(false)
  })
})

// ─── Images ───────────────────────────────────────────────────────────────────

describe('Images', () => {
  it('parses inline image', async () => {
    const result = await mdAdapter.parse(mkFile('![A cat](https://example.com/cat.png)'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const img = p.content[0] as ImageInline
    expect(img.type).toBe('image-inline')
    expect(img.src).toBe('https://example.com/cat.png')
    expect(img.alt).toBe('A cat')
  })

  it('parses image with empty alt text', async () => {
    const result = await mdAdapter.parse(mkFile('![](https://example.com/pic.jpg)'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const p = result.value.blocks[0] as ParagraphBlock
    const img = p.content[0] as ImageInline
    expect(img.type).toBe('image-inline')
    expect(img.src).toBe('https://example.com/pic.jpg')
    expect(img.alt).toBe('')
  })
})

// ─── AbortSignal ──────────────────────────────────────────────────────────────

describe('AbortSignal', () => {
  it('respects pre-aborted signal', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const result = await mdAdapter.parse(mkFile('# Hello'), { signal: ctrl.signal })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('ABORTED')
  })
})

// ─── FILE_TOO_LARGE ───────────────────────────────────────────────────────────

describe('FILE_TOO_LARGE', () => {
  it('returns FILE_TOO_LARGE for files over 10 MB', async () => {
    const big = new Uint8Array(11 * 1024 * 1024)
    const file = new File([big], 'big.md', { type: 'text/markdown' })
    const result = await mdAdapter.parse(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('FILE_TOO_LARGE')
  })
})

// ─── Title extraction ─────────────────────────────────────────────────────────

describe('Title extraction', () => {
  it('extracts title from first H1', async () => {
    const md = '# My Document\n\nSome content.'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.meta?.title).toBe('My Document')
  })

  it('returns undefined title when no H1 present', async () => {
    const md = '## Only H2\n\nSome content.'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.meta?.title).toBeUndefined()
  })

  it('ignores H2 for title extraction', async () => {
    const md = '## Section\n\n# Actual Title'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The first H1 is "Actual Title"
    expect(result.value.meta?.title).toBe('Actual Title')
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('returns empty blocks for empty input', async () => {
    const result = await mdAdapter.parse(mkFile(''))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.blocks).toHaveLength(0)
  })

  it('handles CRLF line endings', async () => {
    const md = '# Title\r\n\r\nParagraph text.'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const heading = result.value.blocks[0] as HeadingBlock
    expect(heading.type).toBe('heading')
    expect(heading.level).toBe(1)
    expect((heading.content[0] as TextInline).text).toBe('Title')
  })

  it('handles ArrayBuffer input', async () => {
    const md = '# ArrayBuffer Test'
    const encoder = new TextEncoder()
    const buffer = encoder.encode(md).buffer
    const result = await mdAdapter.parse(buffer)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.blocks[0]!.type).toBe('heading')
  })

  it('parses multiple paragraphs separated by blank lines', async () => {
    const md = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.'
    const result = await mdAdapter.parse(mkFile(md))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const paragraphs = result.value.blocks.filter(b => b.type === 'paragraph')
    expect(paragraphs).toHaveLength(3)
  })
})
