import { describe, it, expect } from 'vitest'
import { renderCode } from '../../../src/renderer/blocks/renderCode'

describe('renderCode', () => {
  it('renders pre > code with ufpe-code-block class', () => {
    const el = renderCode({ type: 'code', code: 'const x = 1' })
    expect(el.nodeName).toBe('PRE')
    expect(el.className).toBe('ufpe-code-block')
    const code = el.querySelector('code')!
    expect(code).not.toBeNull()
  })

  it('sets language class on code element', () => {
    const el   = renderCode({ type: 'code', code: 'x', language: 'typescript' })
    const code = el.querySelector('code')!
    expect(code.className).toContain('language-typescript')
    expect(code.getAttribute('data-language')).toBe('typescript')
  })

  it('uses textContent for code — never innerHTML (XSS)', () => {
    const evil = '<script>alert(1)</script>'
    const el   = renderCode({ type: 'code', code: evil })
    const code = el.querySelector('code')!
    expect(code.innerHTML).not.toContain('<script>')
    expect(code.textContent).toBe(evil)
  })

  it('renders without language class when language is undefined', () => {
    const el   = renderCode({ type: 'code', code: 'hello' })
    const code = el.querySelector('code')!
    expect(code.className).toBe('')
  })
})
