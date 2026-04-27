// ─── Core types ───────────────────────────────────────────────────────────────
export type {
  Inline, TextInline, LinkInline, ImageInline, UnknownInline,
  Block, ParagraphBlock, HeadingBlock, ListBlock, ListItem,
  TableBlock, TableRow, TableCell, ImageBlock, CodeBlock,
  HrBlock, SlideBlock, SlideElement, UnknownBlock,
  DocumentModel, DocumentMeta,
  ParseError, Result,
} from './core/model/types'
export { ok, err } from './core/model/types'
export * from './core/model/guards'
export { normalizeMeta } from './core/model/meta'

// ─── Adapter interface & registry ─────────────────────────────────────────────
export type { Adapter, ParseOptions } from './core/adapter/Adapter'
export { AdapterRegistry, defaultRegistry } from './core/adapter/AdapterRegistry'

// ─── Engine ───────────────────────────────────────────────────────────────────
export { PreviewEngine, engine, registerAdapter, preview, unmount } from './core/engine/PreviewEngine'
export type { EngineHooks } from './core/engine/PreviewEngine'

// ─── Renderer ─────────────────────────────────────────────────────────────────
export { render, renderError, mount, registerBlockRenderer } from './renderer/index'

// ─── Shared utilities ─────────────────────────────────────────────────────────
export { sanitizeHref } from './shared/url'
export { getMimeType, getExtension } from './shared/mime'
