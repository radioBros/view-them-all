import type { Block, Inline, ListBlock, ListItem } from '../../../core/model/types'
import type { RunContext } from './run'
import { parseRun } from './run'
import { qs, qsAll, wAttr } from '../xml'

export type RawListItem = {
  _listItem: true
  numId:     string
  ilvl:      number
  content:   Inline[]
}

export type RawBlock = Block | RawListItem

export function isRawListItem(b: RawBlock): b is RawListItem {
  return (b as RawListItem)._listItem === true
}

const MAX_LIST_DEPTH = 2

export function parseParagraph(p: Element, ctx: RunContext): RawBlock {
  const pPr       = qs(p, 'pPr')
  const styleEl   = pPr ? qs(pPr, 'pStyle') : null
  const styleName = wAttr(styleEl, 'val') ?? ''
  const numPr     = pPr ? qs(pPr, 'numPr') : null

  // Gather all runs, including those inside hyperlinks
  const content: Inline[] = []
  for (const child of Array.from(p.children)) {
    if (child.tagName.endsWith(':hyperlink') || child.tagName === 'hyperlink') {
      const rId = child.getAttribute('r:id') ?? undefined
      for (const run of qsAll(child, 'r')) {
        content.push(...parseRun(run, ctx, rId))
      }
    } else if (child.tagName.endsWith(':r') || child.tagName === 'r') {
      content.push(...parseRun(child, ctx))
    }
  }

  const finalContent = content.length > 0 ? content : [{ type: 'text' as const, text: '' }]

  // Heading detection
  const headingMatch = styleName.match(/^[Hh]eading\s*([1-6])$/)
  if (headingMatch) {
    return {
      type: 'heading',
      level: parseInt(headingMatch[1] ?? '1') as 1|2|3|4|5|6,
      content: finalContent,
    }
  }

  // List detection
  if (numPr) {
    const numIdEl = qs(numPr, 'numId')
    const ilvlEl  = qs(numPr, 'ilvl')
    const numId   = wAttr(numIdEl, 'val') ?? ''
    const ilvl    = parseInt(wAttr(ilvlEl, 'val') ?? '0')
    if (numId) {
      return { _listItem: true, numId, ilvl, content: finalContent }
    }
  }

  return { type: 'paragraph', content: finalContent }
}

export function buildBlocks(rawBlocks: RawBlock[], numbering: Map<string, { ordered: boolean }>): Block[] {
  const result: Block[] = []
  let i = 0

  while (i < rawBlocks.length) {
    const block = rawBlocks[i]

    if (block && isRawListItem(block)) {
      const numId = block.numId
      const items: RawListItem[] = []
      while (i < rawBlocks.length && isRawListItem(rawBlocks[i]!) && (rawBlocks[i] as RawListItem).numId === numId) {
        items.push(rawBlocks[i++] as RawListItem)
      }
      const numInfo = numbering.get(numId) ?? { ordered: false }
      result.push(buildListTree(items, numInfo))
    } else if (block) {
      result.push(block)
      i++
    } else {
      i++
    }
  }

  return result
}

function buildListTree(items: RawListItem[], numInfo: { ordered: boolean }): ListBlock {
  const ordered = numInfo.ordered
  const rootItems: ListItem[] = []
  const stack: { level: number; list: ListItem[] }[] = [{ level: -1, list: rootItems }]

  for (const item of items) {
    const ilvl = Math.min(item.ilvl, MAX_LIST_DEPTH)
    const listItem: ListItem = { content: item.content }

    while (stack.length > 1 && (stack[stack.length - 1]?.level ?? -1) >= ilvl) {
      stack.pop()
    }

    const current = stack[stack.length - 1]!

    if (ilvl > current.level) {
      const parent = current.list
      const parentItem = parent[parent.length - 1]
      if (parentItem) {
        parentItem.children = { type: 'list', ordered, items: [listItem] }
        stack.push({ level: ilvl, list: parentItem.children.items })
      } else {
        current.list.push(listItem)
      }
    } else {
      current.list.push(listItem)
    }
  }

  return { type: 'list', ordered, items: rootItems }
}
