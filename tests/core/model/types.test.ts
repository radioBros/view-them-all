import { describe, it, expect } from 'vitest'
import {
  ok, err,
  isParagraph, isHeading, isList, isTable, isImage, isCode, isHr, isSlide, isUnknown,
  isTextInline, isLinkInline, isImageInline, isUnknownInline,
} from '../../../src/index'
import type { Block, Inline } from '../../../src/index'

describe('ok / err', () => {
  it('ok() creates a successful result', () => {
    const r = ok({ blocks: [], meta: {} })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.blocks).toEqual([])
  })

  it('err() creates an error result', () => {
    const r = err({ code: 'CORRUPT_FILE', message: 'bad file' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('CORRUPT_FILE')
  })
})

describe('Block type guards', () => {
  const paragraph: Block = { type: 'paragraph', content: [] }
  const heading:   Block = { type: 'heading',   level: 1, content: [] }
  const list:      Block = { type: 'list',       ordered: false, items: [] }
  const table:     Block = { type: 'table',      rows: [] }
  const image:     Block = { type: 'image',      src: 'blob:test' }
  const code:      Block = { type: 'code',       code: 'hello' }
  const hr:        Block = { type: 'hr' }
  const slide:     Block = { type: 'slide',      index: 0, canvasWidth: 100, canvasHeight: 100, elements: [] }
  const unknown:   Block = { type: 'unknown' }

  it('isParagraph', () => {
    expect(isParagraph(paragraph)).toBe(true)
    expect(isParagraph(heading)).toBe(false)
  })
  it('isHeading', () => {
    expect(isHeading(heading)).toBe(true)
    expect(isHeading(paragraph)).toBe(false)
  })
  it('isList', () => { expect(isList(list)).toBe(true); expect(isList(code)).toBe(false) })
  it('isTable', () => { expect(isTable(table)).toBe(true); expect(isTable(hr)).toBe(false) })
  it('isImage', () => { expect(isImage(image)).toBe(true); expect(isImage(code)).toBe(false) })
  it('isCode',  () => { expect(isCode(code)).toBe(true);   expect(isCode(list)).toBe(false) })
  it('isHr',    () => { expect(isHr(hr)).toBe(true);       expect(isHr(paragraph)).toBe(false) })
  it('isSlide', () => { expect(isSlide(slide)).toBe(true); expect(isSlide(table)).toBe(false) })
  it('isUnknown', () => {
    expect(isUnknown(unknown)).toBe(true)
    expect(isUnknown({ type: 'unknown', raw: 'x' } as Block)).toBe(true)
    expect(isUnknown(paragraph)).toBe(false)
  })
})

describe('Inline type guards', () => {
  const text:    Inline = { type: 'text', text: 'hello' }
  const link:    Inline = { type: 'link', text: 'click', href: 'https://example.com' }
  const imgInl:  Inline = { type: 'image-inline', src: 'blob:x' }
  const unkInl:  Inline = { type: 'unknown-inline' }

  it('isTextInline',    () => { expect(isTextInline(text)).toBe(true);    expect(isTextInline(link)).toBe(false) })
  it('isLinkInline',    () => { expect(isLinkInline(link)).toBe(true);    expect(isLinkInline(text)).toBe(false) })
  it('isImageInline',   () => { expect(isImageInline(imgInl)).toBe(true); expect(isImageInline(text)).toBe(false) })
  it('isUnknownInline', () => { expect(isUnknownInline(unkInl)).toBe(true);  expect(isUnknownInline(text)).toBe(false) })
})
