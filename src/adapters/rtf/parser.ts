/**
 * Minimal RTF plain-text extractor.
 *
 * This is a best-effort stripper, not a full RTF parser. It handles ~95% of
 * real-world RTF files produced by Word, LibreOffice, and similar tools.
 */

/**
 * Strip RTF markup from the given RTF document string and return an array of
 * non-empty paragraph strings.
 *
 * Algorithm (steps run in order):
 *  1. Remove known binary/embedded groups (pict, object, fonttbl, colortbl, etc.)
 *  2. Replace \par / \pard paragraph marks with double-newlines so that the
 *     final split on 2+ newlines correctly separates paragraphs.
 *  3. Decode \uN? Unicode escapes.
 *  4. Handle common special characters (\~ → space; \- → soft hyphen dropped).
 *  5. Strip all remaining RTF control words.
 *  6. Strip remaining control symbols (backslash + non-alpha).
 *  7. Strip literal curly braces.
 *  8. Split on 2+ consecutive newlines, trim each paragraph, filter empty strings.
 */
export function stripRTF(text: string): string[] {
  // Step 1: Remove known binary/embedded groups.
  // Note: this simple [^{}]* approach handles flat groups but not deeply nested
  // ones. It covers the vast majority of practical RTF files.
  text = text.replace(/\{\\(?:pict|object|fonttbl|colortbl|stylesheet|info)[^{}]*\}/gi, '')

  // Step 2: Paragraph marks → double newline.
  // \pard? matches both \par and \pard. The character class after ensures we
  // match a control word boundary (space, tab, backslash, brace, CR, LF).
  text = text.replace(/\\pard?[ \t\\{}\r\n]/gi, '\n\n')

  // Step 3: Unicode escapes \uN? → the Unicode character.
  // RTF encodes codepoints > 32767 as signed int16 (negative values). Using
  // `n & 0xFFFF` converts the signed value back to an unsigned codepoint via
  // JS bitwise coercion (int32 mask).
  text = text.replace(/\\u(-?\d+)\??/g, (_match, nStr) => {
    const n = parseInt(nStr, 10)
    return String.fromCharCode(n & 0xFFFF)
  })

  // Step 4: Common special characters.
  text = text.replace(/\\~/g, ' ')   // non-breaking space
  text = text.replace(/\\-/g, '')    // optional (soft) hyphen — drop

  // Step 5: Strip remaining RTF control words (e.g. \rtf1, \ansi, \b, \i0).
  text = text.replace(/\\[a-z*]+(-?\d+)?[ ]?/gi, '')

  // Step 6: Strip remaining control symbols (backslash followed by non-alpha,
  // e.g. \*, \|, \:, \\).
  text = text.replace(/\\[^a-z\n]/gi, '')

  // Step 7: Strip literal curly braces left over from group delimiters.
  text = text.replace(/[{}]/g, '')

  // Step 8: Split on 2+ consecutive newlines, trim, filter empty.
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
}
