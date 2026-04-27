import type JSZip from 'jszip'
import type { Block } from '../../../core/model/types'
import type { RelMap } from './relationships'
import type { StyleMap } from './styles'
import type { NumberingMap } from './numbering'
import { parseParagraph, buildBlocks, type RawBlock } from './paragraph'
import { parseTable } from './table'
import { resolveImageObjectUrl } from './image'
import { qs } from '../xml'

export type ParseContext = {
  rels:      RelMap
  styles:    StyleMap
  numbering: NumberingMap
  zip:       JSZip
  signal?:   AbortSignal
}

export async function parseDocument(body: Element, ctx: ParseContext): Promise<Block[]> {
  const rawBlocks: RawBlock[] = []

  for (const child of Array.from(body.children)) {
    if (ctx.signal?.aborted) break

    const tag = child.tagName

    if (tag.endsWith(':p') || tag === 'p') {
      rawBlocks.push(parseParagraph(child, ctx))
    } else if (tag.endsWith(':tbl') || tag === 'tbl') {
      rawBlocks.push(parseTable(child, ctx))
    } else if (tag.endsWith(':sectPr') || tag === 'sectPr') {
      // Section properties — ignore
    } else {
      rawBlocks.push({ type: 'unknown' })
    }
  }

  if (ctx.signal?.aborted) return []

  const blocks = buildBlocks(rawBlocks, ctx.numbering)

  // Resolve drawing references in paragraphs — convert to ImageBlock
  await resolveDrawingImages(body, blocks, ctx)

  return blocks
}

async function resolveDrawingImages(
  body: Element,
  blocks: Block[],
  ctx: ParseContext
): Promise<void> {
  let blockIdx = 0
  for (const child of Array.from(body.children)) {
    if (blockIdx >= blocks.length) break
    const block = blocks[blockIdx]
    if (!block) { blockIdx++; continue }

    const tag = child.tagName
    if (tag.endsWith(':p') || tag === 'p') {
      const blip = qs(child, 'blip')
      if (blip && block.type === 'paragraph') {
        const rId = blip.getAttribute('r:embed') ?? blip.getAttribute('embed')
        if (rId) {
          const src = await resolveImageObjectUrl(rId, ctx.rels, ctx.zip, ctx.signal)
          if (src) {
            blocks[blockIdx] = { type: 'image', src }
          }
        }
      }
    }
    blockIdx++
  }
}
