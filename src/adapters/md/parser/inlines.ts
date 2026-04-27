import type { Inline } from '../../../core/model/types'

/**
 * Single-pass regex-based inline Markdown parser.
 * Priority order (earlier groups take precedence):
 *   1. Inline code
 *   2. Images
 *   3. Links
 *   4. Bold+italic (*** or ___)
 *   5. Bold (** or __)
 *   6. Italic (* or _)
 *   7. Strikethrough (~~)
 */
const INLINE_RE = new RegExp(
  '`([^`\\n]+)`'                               // [1] code
  + '|!\\[([^\\]]*)\\]\\(([^)\\s]+)\\)'        // [2,3] image alt, src
  + '|\\[([^\\]]+)\\]\\(([^)\\s]+)\\)'         // [4,5] link text, href
  + '|\\*\\*\\*([^*\\n]+?)\\*\\*\\*'           // [6] bold+italic ***
  + '|___([^_\\n]+?)___'                        // [7] bold+italic ___
  + '|\\*\\*([^*\\n]+?)\\*\\*'                 // [8] bold **
  + '|__([^_\\n]+?)__'                          // [9] bold __
  + '|\\*([^*\\n]+?)\\*'                        // [10] italic *
  + '|_([^_\\n]+?)_'                            // [11] italic _
  + '|~~([^~\\n]+?)~~',                         // [12] strikethrough
  'g'
)

export function parseInlines(text: string): Inline[] {
  const result: Inline[] = []
  let lastIndex = 0
  INLINE_RE.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = INLINE_RE.exec(text)) !== null) {
    const [
      full,
      code,          // [1]
      imageAlt,      // [2]
      imageSrc,      // [3]
      linkText,      // [4]
      linkHref,      // [5]
      boldItalicStar,// [6]
      boldItalicUnd, // [7]
      boldStar,      // [8]
      boldUnd,       // [9]
      italicStar,    // [10]
      italicUnd,     // [11]
      strikethrough, // [12]
    ] = match

    // Emit any plain text before this match
    if (match.index > lastIndex) {
      result.push({ type: 'text', text: text.slice(lastIndex, match.index) })
    }
    lastIndex = match.index + full.length

    if (code !== undefined) {
      result.push({ type: 'text', text: code, code: true })
    } else if (imageSrc !== undefined) {
      result.push({ type: 'image-inline', src: imageSrc, alt: imageAlt ?? undefined })
    } else if (linkHref !== undefined) {
      if (linkHref.toLowerCase().startsWith('javascript:')) {
        // Skip unsafe links — emit raw text instead
        result.push({ type: 'text', text: full })
      } else {
        result.push({ type: 'link', text: linkText!, href: linkHref })
      }
    } else if (boldItalicStar !== undefined) {
      result.push({ type: 'text', text: boldItalicStar, bold: true, italic: true })
    } else if (boldItalicUnd !== undefined) {
      result.push({ type: 'text', text: boldItalicUnd, bold: true, italic: true })
    } else if (boldStar !== undefined) {
      result.push({ type: 'text', text: boldStar, bold: true })
    } else if (boldUnd !== undefined) {
      result.push({ type: 'text', text: boldUnd, bold: true })
    } else if (italicStar !== undefined) {
      result.push({ type: 'text', text: italicStar, italic: true })
    } else if (italicUnd !== undefined) {
      result.push({ type: 'text', text: italicUnd, italic: true })
    } else if (strikethrough !== undefined) {
      result.push({ type: 'text', text: strikethrough, strikethrough: true })
    }
  }

  // Emit any trailing plain text
  if (lastIndex < text.length) {
    result.push({ type: 'text', text: text.slice(lastIndex) })
  }

  return result
}
