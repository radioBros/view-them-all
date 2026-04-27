import { describe, it, expect } from 'vitest'
import { renderLink, renderText } from '../../src/renderer/inline/renderInline'
import { sanitizeHref } from '../../src/shared/url'

describe('sanitizeHref', () => {
  it('allows https:', () => expect(sanitizeHref('https://example.com')).toBe('https://example.com'))
  it('allows http:',  () => expect(sanitizeHref('http://example.com')).toBe('http://example.com'))
  it('allows mailto:', () => expect(sanitizeHref('mailto:a@b.com')).toBe('mailto:a@b.com'))
  it('allows tel:',   () => expect(sanitizeHref('tel:+123')).toBe('tel:+123'))
  it('allows relative /',   () => expect(sanitizeHref('/foo')).toBe('/foo'))
  it('allows relative ./',  () => expect(sanitizeHref('./foo')).toBe('./foo'))
  it('allows relative ../', () => expect(sanitizeHref('../foo')).toBe('../foo'))

  it('rejects javascript:', () => expect(sanitizeHref('javascript:alert(1)')).toBeNull())
  it('rejects data:',       () => expect(sanitizeHref('data:text/html,<h1>xss</h1>')).toBeNull())
  it('rejects vbscript:',   () => expect(sanitizeHref('vbscript:msgbox(1)')).toBeNull())
  it('rejects bare string', () => expect(sanitizeHref('alert(1)')).toBeNull())
})

describe('XSS prevention in renderer', () => {
  it('javascript: href → plain text, not anchor', () => {
    const node = renderLink({ type: 'link', text: 'click', href: 'javascript:alert(1)' })
    expect(node.nodeName).toBe('#text')
    expect(node.textContent).toBe('click')
  })

  it('data: href → plain text', () => {
    const node = renderLink({ type: 'link', text: 'x', href: 'data:text/html,<h1>xss</h1>' })
    expect(node.nodeName).toBe('#text')
  })

  it('text with HTML entities is never parsed as HTML', () => {
    const node = renderText({ type: 'text', text: '<img src=x onerror=alert(1)>', bold: true }) as HTMLSpanElement
    expect(node.innerHTML).not.toContain('<img')
    expect(node.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('script tag in text is escaped', () => {
    const node = renderText({ type: 'text', text: '<script>alert(1)</script>' }) as Text
    expect(node.nodeType).toBe(Node.TEXT_NODE)
    expect(node.textContent).toBe('<script>alert(1)</script>')
  })
})
