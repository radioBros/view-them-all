import { describe, it, expect } from 'vitest'
import { renderParagraph } from '../../../src/renderer/blocks/renderParagraph'
import { renderHeading }   from '../../../src/renderer/blocks/renderHeading'
import { renderList }      from '../../../src/renderer/blocks/renderList'
import { renderImage }     from '../../../src/renderer/blocks/renderImage'
import { renderUnknown }   from '../../../src/renderer/blocks/renderUnknown'
import { renderBlock }     from '../../../src/renderer/blocks/index'
import type { ParagraphBlock, HeadingBlock, ListBlock, ImageBlock, UnknownBlock } from '../../../src/core/model/types'

// ─── renderParagraph ─────────────────────────────────────────────────────────

describe('renderParagraph', () => {
  it('renders a <p> with ufpe-paragraph class', () => {
    const block: ParagraphBlock = { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }
    const el = renderParagraph(block)
    expect(el.tagName).toBe('P')
    expect(el.className).toBe('ufpe-paragraph')
    expect(el.textContent).toBe('Hello')
  })

  it('renders inline content as text nodes (no innerHTML)', () => {
    const block: ParagraphBlock = { type: 'paragraph', content: [{ type: 'text', text: '<b>xss</b>' }] }
    const el = renderParagraph(block)
    expect(el.innerHTML).not.toContain('<b>')
    expect(el.textContent).toBe('<b>xss</b>')
  })

  it('renders empty paragraph', () => {
    const block: ParagraphBlock = { type: 'paragraph', content: [] }
    const el = renderParagraph(block)
    expect(el.tagName).toBe('P')
    expect(el.textContent).toBe('')
  })

  it('renders multiple inline nodes', () => {
    const block: ParagraphBlock = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hello ', bold: true },
        { type: 'text', text: 'World' },
      ],
    }
    const el = renderParagraph(block)
    expect(el.textContent).toBe('Hello World')
    expect(el.querySelector('.ufpe-bold')).not.toBeNull()
  })
})

// ─── renderHeading ────────────────────────────────────────────────────────────

describe('renderHeading', () => {
  it('renders h1 through h6', () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      const block: HeadingBlock = { type: 'heading', level, content: [{ type: 'text', text: `H${level}` }] }
      const el = renderHeading(block)
      expect(el.tagName).toBe(`H${level}`)
      expect(el.classList.contains(`ufpe-h${level}`)).toBe(true)
      expect(el.classList.contains('ufpe-heading')).toBe(true)
    }
  })

  it('renders heading text correctly', () => {
    const block: HeadingBlock = { type: 'heading', level: 2, content: [{ type: 'text', text: 'Section Title' }] }
    const el = renderHeading(block)
    expect(el.textContent).toBe('Section Title')
  })

  it('escapes XSS in heading text', () => {
    const block: HeadingBlock = { type: 'heading', level: 1, content: [{ type: 'text', text: '<script>alert(1)</script>' }] }
    const el = renderHeading(block)
    expect(el.innerHTML).not.toContain('<script>')
    expect(el.textContent).toContain('<script>')
  })
})

// ─── renderList ───────────────────────────────────────────────────────────────

describe('renderList', () => {
  it('renders unordered list as <ul>', () => {
    const block: ListBlock = {
      type: 'list', ordered: false,
      items: [
        { content: [{ type: 'text', text: 'Item 1' }] },
        { content: [{ type: 'text', text: 'Item 2' }] },
      ],
    }
    const el = renderList(block)
    expect(el.tagName).toBe('UL')
    expect(el.className).toBe('ufpe-list-unordered')
    expect(el.querySelectorAll('li').length).toBe(2)
  })

  it('renders ordered list as <ol>', () => {
    const block: ListBlock = {
      type: 'list', ordered: true,
      items: [{ content: [{ type: 'text', text: 'First' }] }],
    }
    const el = renderList(block)
    expect(el.tagName).toBe('OL')
    expect(el.className).toBe('ufpe-list-ordered')
  })

  it('renders nested list recursively', () => {
    const block: ListBlock = {
      type: 'list', ordered: false,
      items: [{
        content: [{ type: 'text', text: 'Parent' }],
        children: {
          type: 'list', ordered: false,
          items: [{ content: [{ type: 'text', text: 'Child' }] }],
        },
      }],
    }
    const el = renderList(block)
    const nested = el.querySelector('ul')
    expect(nested).not.toBeNull()
    expect(el.textContent).toContain('Child')
  })

  it('li items have ufpe-list-item class', () => {
    const block: ListBlock = {
      type: 'list', ordered: false,
      items: [{ content: [{ type: 'text', text: 'x' }] }],
    }
    const el = renderList(block)
    expect(el.querySelector('li')?.className).toBe('ufpe-list-item')
  })
})

// ─── renderImage ──────────────────────────────────────────────────────────────

describe('renderImage', () => {
  it('renders figure > img structure', () => {
    const block: ImageBlock = { type: 'image', src: 'blob:test-123', alt: 'test' }
    const el = renderImage(block)
    expect(el.tagName).toBe('FIGURE')
    expect(el.className).toBe('ufpe-image-block')
    const img = el.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.src).toContain('blob:test-123')
    expect(img!.alt).toBe('test')
  })

  it('renders caption when provided', () => {
    const block: ImageBlock = { type: 'image', src: 'blob:x', caption: 'My Caption' }
    const el = renderImage(block)
    const cap = el.querySelector('figcaption')
    expect(cap).not.toBeNull()
    expect(cap!.textContent).toBe('My Caption')
    expect(cap!.className).toBe('ufpe-image-caption')
  })

  it('does not render figcaption when no caption', () => {
    const block: ImageBlock = { type: 'image', src: 'blob:x' }
    const el = renderImage(block)
    expect(el.querySelector('figcaption')).toBeNull()
  })

  it('sets width and height when provided', () => {
    const block: ImageBlock = { type: 'image', src: 'blob:x', width: 200, height: 100 }
    const el = renderImage(block)
    const img = el.querySelector('img')!
    expect(img.width).toBe(200)
    expect(img.height).toBe(100)
  })
})

// ─── renderUnknown ────────────────────────────────────────────────────────────

describe('renderUnknown', () => {
  it('renders a div with ufpe-unknown-block class', () => {
    const block: UnknownBlock = { type: 'unknown' }
    const el = renderUnknown(block)
    expect(el.tagName).toBe('DIV')
    expect(el.className).toBe('ufpe-unknown-block')
  })

  it('does not render raw content (XSS prevention)', () => {
    const block: UnknownBlock = { type: 'unknown', raw: '<script>alert(1)</script>' }
    const el = renderUnknown(block)
    expect(el.innerHTML).not.toContain('<script>')
    expect(el.textContent).toBe('')
  })
})

// ─── renderBlock dispatcher ───────────────────────────────────────────────────

describe('renderBlock dispatcher', () => {
  it('dispatches paragraph correctly', () => {
    const container = document.createElement('div')
    renderBlock({ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }, container)
    expect(container.querySelector('p')).not.toBeNull()
  })

  it('dispatches heading correctly', () => {
    const container = document.createElement('div')
    renderBlock({ type: 'heading', level: 3, content: [{ type: 'text', text: 'Title' }] }, container)
    expect(container.querySelector('h3')).not.toBeNull()
  })

  it('dispatches hr correctly', () => {
    const container = document.createElement('div')
    renderBlock({ type: 'hr' }, container)
    expect(container.querySelector('hr')).not.toBeNull()
  })

  it('shows unknown placeholder for unregistered extension block type', () => {
    const container = document.createElement('div')
    renderBlock({ type: 'unknown', raw: 'mystery' } as any, container)
    expect(container.querySelector('.ufpe-unknown-block')).not.toBeNull()
  })

  it('shows unknown placeholder when block render throws', () => {
    const container = document.createElement('div')
    // heading with invalid level triggers error boundary
    renderBlock({ type: 'heading', level: 99 as any, content: [] } as any, container)
    // should not throw, and renders something
    expect(container.children.length).toBeGreaterThan(0)
  })
})
