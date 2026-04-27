import type { DocumentMeta } from './types'

export function normalizeMeta(raw: Partial<DocumentMeta>): DocumentMeta {
  return {
    title:      raw.title?.trim()    || undefined,
    author:     raw.author?.trim()   || undefined,
    created:    raw.created instanceof Date ? raw.created : undefined,
    modified:   raw.modified instanceof Date ? raw.modified : undefined,
    subject:    raw.subject?.trim()  || undefined,
    keywords:   raw.keywords?.filter(Boolean),
    pageCount:  typeof raw.pageCount === 'number' && raw.pageCount > 0 ? raw.pageCount : undefined,
    slideCount: typeof raw.slideCount === 'number' ? raw.slideCount : undefined,
    sheetNames: raw.sheetNames?.filter(Boolean),
    language:   raw.language?.trim() || undefined,
  }
}
