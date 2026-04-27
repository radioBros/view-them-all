import { describe, it, expect, vi } from 'vitest'
import { mount, unmount } from '../../src/renderer/Container'
import type { DocumentModel } from '../../src/core/model/types'

const simpleModel: DocumentModel = {
  blocks: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello!' }] }],
}

describe('Container', () => {
  it('mount renders into container', () => {
    const div = document.createElement('div')
    mount(div, simpleModel)
    expect(div.querySelector('p')).not.toBeNull()
    expect(div.textContent).toContain('Hello!')
  })

  it('unmount clears container', () => {
    const div = document.createElement('div')
    mount(div, simpleModel)
    unmount(div)
    expect(div.innerHTML).toBe('')
  })

  it('mount replaces previous content', () => {
    const div = document.createElement('div')
    mount(div, simpleModel)
    mount(div, { blocks: [{ type: 'heading', level: 1, content: [{ type: 'text', text: 'New' }] }] })
    expect(div.querySelector('h1')).not.toBeNull()
    expect(div.querySelector('p')).toBeNull()
  })

  it('unmount revokes blob: object URLs', () => {
    const revokedUrls: string[] = []
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => { revokedUrls.push(url) })

    const div = document.createElement('div')
    const model: DocumentModel = {
      blocks: [{ type: 'image', src: 'blob:test-url-123' }],
    }
    mount(div, model)
    unmount(div)
    expect(revokedUrls).toContain('blob:test-url-123')

    vi.restoreAllMocks()
  })
})
