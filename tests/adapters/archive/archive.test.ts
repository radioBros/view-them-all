import { describe, it, expect } from 'vitest'
import { archiveAdapter } from '../../../src/adapters/archive/index'
import JSZip from 'jszip'

async function makeZip(entries: Record<string, string | null>): Promise<File> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(entries)) {
    if (content === null) {
      zip.folder(path)
    } else {
      zip.file(path, content)
    }
  }
  const buf = await zip.generateAsync({ type: 'arraybuffer' })
  return new File([buf], 'test.zip')
}

describe('archiveAdapter', () => {
  it('parses a simple zip into archive-tree block', async () => {
    const file   = await makeZip({ 'readme.txt': 'hello', 'src/index.ts': 'code' })
    const result = await archiveAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const block = result.value.blocks[0] as any
    expect(block.type).toBe('archive-tree')
    expect(block.root.isDir).toBe(true)
  })

  it('includes meta.title as filename', async () => {
    const zip = new JSZip()
    zip.file('a.txt', 'hi')
    const buf  = await zip.generateAsync({ type: 'arraybuffer' })
    const file = new File([buf], 'myarchive.zip')
    const result = await archiveAdapter.parse(file)
    if (!result.ok) return
    expect(result.value.meta?.title).toBe('myarchive.zip')
  })

  it('builds nested directory structure', async () => {
    const file   = await makeZip({
      'src/components/Button.tsx': 'export default {}',
      'src/index.ts':              'export * from "./components/Button"',
      'README.md':                 '# hi',
    })
    const result = await archiveAdapter.parse(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const root = (result.value.blocks[0] as any).root
    const src  = root.children.find((c: any) => c.name === 'src')
    expect(src).toBeDefined()
    expect(src.isDir).toBe(true)
  })

  it('parses an empty zip', async () => {
    const file   = await makeZip({})
    const result = await archiveAdapter.parse(file)
    expect(result.ok).toBe(true)
  })
})
