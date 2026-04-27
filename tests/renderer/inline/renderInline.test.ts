import { describe, it, expect } from 'vitest'
import { renderInline, renderText, renderLink, renderUnknownInline } from '../../../src/renderer/inline/renderInline'
import type { TextInline, LinkInline, UnknownInline } from '../../../src/core/model/types'

describe('renderText', () => {
  it('returns a text node for plain text with no formatting', () => {
    const node = renderText({ type: 'text', text: 'hello' })
    expect(node.nodeType).toBe(Node.TEXT_NODE)
    expect(node.textContent).toBe('hello')
  })

  it('returns a span with bold class for bold text', () => {
    const node = renderText({ type: 'text', text: 'hi', bold: true }) as HTMLSpanElement
    expect(node.nodeName).toBe('SPAN')
    expect(node.classList.contains('ufpe-bold')).toBe(true)
    expect(node.textContent).toBe('hi')
  })

  it('stacks multiple formatting classes', () => {
    const node = renderText({
      type: 'text', text: 'x', bold: true, italic: true, underline: true
    }) as HTMLSpanElement
    expect(node.classList.contains('ufpe-bold')).toBe(true)
    expect(node.classList.contains('ufpe-italic')).toBe(true)
    expect(node.classList.contains('ufpe-underline')).toBe(true)
  })

  it('never uses innerHTML (XSS safety)', () => {
    const node = renderText({ type: 'text', text: '<script>alert(1)</script>', bold: true }) as HTMLSpanElement
    expect(node.innerHTML).not.toContain('<script>')
    expect(node.textContent).toBe('<script>alert(1)</script>')
  })

  it('applies color via CSS variable', () => {
    const node = renderText({ type: 'text', text: 'x', color: '#ff0000' }) as HTMLSpanElement
    expect(node.classList.contains('ufpe-colored-text')).toBe(true)
    expect(node.style.getPropertyValue('--ufpe-text-color')).toBe('#ff0000')
  })
})

describe('renderLink', () => {
  it('renders safe https link', () => {
    const node = renderLink({ type: 'link', text: 'Click', href: 'https://example.com' }) as HTMLAnchorElement
    expect(node.nodeName).toBe('A')
    expect(node.href).toBe('https://example.com/')
    expect(node.textContent).toBe('Click')
    expect(node.rel).toContain('noopener')
  })

  it('rejects javascript: href — degrades to text node', () => {
    const node = renderLink({ type: 'link', text: 'click', href: 'javascript:alert(1)' })
    expect(node.nodeName).toBe('#text')
    expect(node.textContent).toBe('click')
  })

  it('rejects data: href', () => {
    const node = renderLink({ type: 'link', text: 'x', href: 'data:text/html,<h1>xss</h1>' })
    expect(node.nodeName).toBe('#text')
  })
})

describe('renderInline — array dispatch', () => {
  it('renders mixed inline array', () => {
    const nodes = renderInline([
      { type: 'text',          text: 'hello' },
      { type: 'link',          text: 'world', href: 'https://example.com' },
      { type: 'unknown-inline' },
    ])
    expect(nodes).toHaveLength(3)
    expect(nodes[0]!.nodeType).toBe(Node.TEXT_NODE)
    expect((nodes[1] as HTMLElement).nodeName).toBe('A')
    expect((nodes[2] as HTMLElement).classList.contains('ufpe-unknown-inline')).toBe(true)
  })
})

describe('renderUnknownInline', () => {
  it('renders a placeholder span without raw content', () => {
    const span = renderUnknownInline({ type: 'unknown-inline', raw: '<script>alert(1)</script>' })
    expect(span.className).toBe('ufpe-unknown-inline')
    expect(span.innerHTML).toBe('')
  })
})
