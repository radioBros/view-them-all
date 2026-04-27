import type {
  Inline, TextInline, LinkInline, ImageInline, UnknownInline,
  Block, ParagraphBlock, HeadingBlock, ListBlock, TableBlock,
  ImageBlock, CodeBlock, HrBlock, SlideBlock, UnknownBlock,
} from './types'

export function isTextInline(i: Inline): i is TextInline         { return i.type === 'text' }
export function isLinkInline(i: Inline): i is LinkInline         { return i.type === 'link' }
export function isImageInline(i: Inline): i is ImageInline       { return i.type === 'image-inline' }
export function isUnknownInline(i: Inline): i is UnknownInline   { return i.type === 'unknown-inline' }

export function isParagraph(b: Block): b is ParagraphBlock       { return b.type === 'paragraph' }
export function isHeading(b: Block): b is HeadingBlock           { return b.type === 'heading' }
export function isList(b: Block): b is ListBlock                  { return b.type === 'list' }
export function isTable(b: Block): b is TableBlock                { return b.type === 'table' }
export function isImage(b: Block): b is ImageBlock                { return b.type === 'image' }
export function isCode(b: Block): b is CodeBlock                  { return b.type === 'code' }
export function isHr(b: Block): b is HrBlock                     { return b.type === 'hr' }
export function isSlide(b: Block): b is SlideBlock                { return b.type === 'slide' }
export function isUnknown(b: Block): b is UnknownBlock            { return b.type === 'unknown' }
