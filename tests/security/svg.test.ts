import { describe, it, expect } from 'vitest'
import { sanitizeSvg } from '../../src/adapters/image/index'

describe('SVG sanitization', () => {
  it('removes <script> elements', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><circle r="10"/></svg>`
    const out = sanitizeSvg(svg)
    expect(out).not.toContain('<script')
    expect(out).toContain('circle')
  })

  it('removes on* event attributes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)" width="10" height="10"/></svg>`
    const out = sanitizeSvg(svg)
    expect(out).not.toContain('onload')
    expect(out).toContain('width')
  })

  it('removes javascript: href attributes', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>click</text></a></svg>`
    const out = sanitizeSvg(svg)
    expect(out).not.toContain('javascript:')
  })

  it('removes <foreignObject>', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div>xss</div></foreignObject></svg>`
    const out = sanitizeSvg(svg)
    expect(out).not.toContain('foreignObject')
  })

  it('preserves benign SVG content', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="red" width="50" height="50"/></svg>`
    const out = sanitizeSvg(svg)
    expect(out).toContain('rect')
    expect(out).toContain('fill')
  })
})
