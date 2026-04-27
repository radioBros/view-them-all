import { describe, it, expect } from 'vitest'
import { normalizeMeta } from '../../../src/core/model/meta'

describe('normalizeMeta', () => {
  it('trims string fields', () => {
    const m = normalizeMeta({ title: '  Hello  ', author: ' World ' })
    expect(m.title).toBe('Hello')
    expect(m.author).toBe('World')
  })

  it('returns undefined for empty strings', () => {
    const m = normalizeMeta({ title: '  ', author: '' })
    expect(m.title).toBeUndefined()
    expect(m.author).toBeUndefined()
  })

  it('preserves Date objects', () => {
    const d = new Date('2024-01-01')
    const m = normalizeMeta({ created: d })
    expect(m.created).toBe(d)
  })

  it('ignores non-Date created values', () => {
    const m = normalizeMeta({ created: 'not-a-date' as any })
    expect(m.created).toBeUndefined()
  })

  it('filters empty keywords', () => {
    const m = normalizeMeta({ keywords: ['a', '', 'b'] })
    expect(m.keywords).toEqual(['a', 'b'])
  })

  it('ignores non-positive pageCount', () => {
    expect(normalizeMeta({ pageCount: 0 }).pageCount).toBeUndefined()
    expect(normalizeMeta({ pageCount: -1 }).pageCount).toBeUndefined()
    expect(normalizeMeta({ pageCount: 5 }).pageCount).toBe(5)
  })
})
