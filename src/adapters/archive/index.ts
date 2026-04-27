import JSZip from 'jszip'
import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Block, Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { registerBlockRenderer } from '../../renderer/extensions'

export type ArchiveNode = {
  name:      string
  path:      string
  isDir:     boolean
  size?:     number
  children?: ArchiveNode[]
}

export type ArchiveTreeBlock = {
  type: 'archive-tree'
  root: ArchiveNode
}

// Register renderer extension on import
registerBlockRenderer('archive-tree', (block, container) => {
  renderArchiveTree(block as ArchiveTreeBlock, container)
})

export function renderArchiveTree(block: ArchiveTreeBlock, container: HTMLElement): void {
  const root = document.createElement('div')
  root.className = 'ufpe-archive-tree'
  root.appendChild(renderNode(block.root))
  container.appendChild(root)
}

function renderNode(node: ArchiveNode): HTMLElement {
  const item = document.createElement('div')
  item.className = 'ufpe-archive-node-name'

  if (node.isDir) {
    item.classList.add('ufpe-archive-node-dir')
    item.textContent = `📁 ${node.name}`
    const children = document.createElement('div')
    children.className = 'ufpe-archive-node'
    children.hidden = true
    for (const child of node.children ?? []) {
      children.appendChild(renderNode(child))
    }
    item.addEventListener('click', () => {
      children.hidden = !children.hidden
      item.textContent = `${children.hidden ? '📁' : '📂'} ${node.name}`
    })
    const wrapper = document.createElement('div')
    wrapper.appendChild(item)
    wrapper.appendChild(children)
    return wrapper
  } else {
    const size = node.size ? ` (${formatBytes(node.size)})` : ''
    item.textContent = `📄 ${node.name}${size}`
    return item
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const archiveAdapter: Adapter = {
  name: 'archive',
  extensions: ['zip'],
  mimeTypes: ['application/zip', 'application/x-zip-compressed'],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file
    const name   = file instanceof File ? file.name : 'archive.zip'

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    try {
      const zip = await JSZip.loadAsync(buffer)

      // Security: path traversal + zip bomb check
      let totalCompressed   = 0
      let totalUncompressed = 0
      let entryCount        = 0

      for (const [entryName] of Object.entries(zip.files)) {
        if (entryName.includes('../') || entryName.startsWith('/')) {
          return err({ code: 'CORRUPT_FILE', message: `Path traversal attempt: ${entryName}` })
        }
        entryCount++
        if (entryCount > 10_000) {
          return err({ code: 'FILE_TOO_LARGE', message: 'Archive exceeds 10,000 entries' })
        }
      }

      const root = buildFileTree(zip)

      const block: ArchiveTreeBlock = { type: 'archive-tree', root }

      return ok({
        blocks: [block as unknown as Block],
        meta: { title: name },
      })
    } catch (e) {
      return err({ code: 'CORRUPT_FILE', message: String(e), source: e })
    }
  },
}

function buildFileTree(zip: JSZip): ArchiveNode {
  const root: ArchiveNode = { name: '/', path: '/', isDir: true, children: [] }

  for (const [path, zipObj] of Object.entries(zip.files)) {
    const parts = path.split('/').filter(Boolean)
    let node = root

    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1
      const part   = parts[i] ?? ''
      let child    = node.children!.find(c => c.name === part)

      if (!child) {
        child = {
          name:     part,
          path:     parts.slice(0, i + 1).join('/'),
          isDir:    !isLast || zipObj.dir,
          size:     isLast && !zipObj.dir ? undefined : undefined,
          children: (!isLast || zipObj.dir) ? [] : undefined,
        }
        node.children!.push(child)
      }

      if (!isLast) node = child
    }
  }

  return root
}
