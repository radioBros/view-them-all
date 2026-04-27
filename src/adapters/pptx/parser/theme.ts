import { parseXml, qs } from '../xml'

export type ThemeColors = Map<string, string>

export function parseThemeColors(themeXml: string): ThemeColors {
  const map: ThemeColors = new Map()
  try {
    const doc = parseXml(themeXml)
    const clrScheme = qs(doc, 'clrScheme')
    if (!clrScheme) return map

    for (const child of Array.from(clrScheme.children)) {
      const name  = child.localName
      const color = extractSchemeColor(child)
      if (color) map.set(name, color)
    }

    // Standard OOXML aliases
    if (map.has('lt1')) map.set('bg1', map.get('lt1')!)
    if (map.has('lt2')) map.set('bg2', map.get('lt2')!)
    if (map.has('dk1')) map.set('tx1', map.get('dk1')!)
    if (map.has('dk2')) map.set('tx2', map.get('dk2')!)
  } catch {
    // Return partial/empty map on error
  }
  return map
}

function extractSchemeColor(el: Element): string | undefined {
  for (const child of Array.from(el.children)) {
    const ln = child.localName
    if (ln === 'srgbClr') {
      const val = child.getAttribute('val')
      if (val) return `#${val}`
    } else if (ln === 'sysClr') {
      const lastClr = child.getAttribute('lastClr')
      if (lastClr) return `#${lastClr}`
    }
  }
  return undefined
}

/**
 * Resolve a solidFill-like element to a hex color string.
 * Handles srgbClr, schemeClr (with lumMod/tint/shade/lumOff modifiers),
 * prstClr, and sysClr.
 */
export function resolveColorEl(
  fillEl: Element,
  themeColors: ThemeColors,
): string | undefined {
  for (const child of Array.from(fillEl.children)) {
    const ln = child.localName
    if (ln === 'srgbClr') {
      const val = child.getAttribute('val')
      if (val) return applyModifiers(`#${val}`, child)
    } else if (ln === 'schemeClr') {
      const val = child.getAttribute('val')
      if (!val) continue
      const base = themeColors.get(val)
      if (base) return applyModifiers(base, child)
    } else if (ln === 'sysClr') {
      const lastClr = child.getAttribute('lastClr')
      if (lastClr) return applyModifiers(`#${lastClr}`, child)
    } else if (ln === 'prstClr') {
      const val = child.getAttribute('val')
      if (val) {
        const base = PRESET_COLORS[val]
        if (base) return applyModifiers(base, child)
      }
    }
  }
  return undefined
}

// ─── Color math ──────────────────────────────────────────────────────────────

function applyModifiers(hex: string, modEl: Element): string {
  const lumMod = getModVal(modEl, 'lumMod')
  const lumOff = getModVal(modEl, 'lumOff')
  const shade  = getModVal(modEl, 'shade')
  const tint   = getModVal(modEl, 'tint')

  if (lumMod === null && lumOff === null && shade === null && tint === null) {
    return hex
  }

  const [r, g, b]  = hexToRgb(hex)
  let   [h, s, l]  = rgbToHsl(r, g, b)

  // All OOXML modifier values are in 1/1000 of a percent (100000 = 100%)
  if (lumMod !== null) l  = l * (lumMod / 100000)
  if (lumOff !== null) l  = l + (lumOff / 100000)
  if (shade  !== null) l  = l * (shade  / 100000)
  if (tint   !== null) l  = l + (1 - l) * (1 - tint / 100000)

  l = Math.max(0, Math.min(1, l))

  const [nr, ng, nb] = hslToRgb(h, s, l)
  return rgbToHex(nr, ng, nb)
}

function getModVal(el: Element, name: string): number | null {
  for (const child of Array.from(el.children)) {
    if (child.localName === name) {
      const val = child.getAttribute('val')
      return val !== null ? parseInt(val, 10) : null
    }
  }
  return null
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16)
  return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map(v => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb)
  const l   = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rr)      h = (gg - bb) / d + (gg < bb ? 6 : 0)
  else if (max === gg) h = (bb - rr) / d + 2
  else                 h = (rr - gg) / d + 4
  return [h / 6, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v] }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h)         * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ]
}

// Subset of OOXML preset colors
const PRESET_COLORS: Record<string, string> = {
  aliceBlue: '#F0F8FF', antiqueWhite: '#FAEBD7', aqua: '#00FFFF',
  black: '#000000', blue: '#0000FF', brown: '#A52A2A',
  coral: '#FF7F50', crimson: '#DC143C', cyan: '#00FFFF',
  darkBlue: '#00008B', darkGray: '#A9A9A9', darkGreen: '#006400',
  darkRed: '#8B0000', darkSlateBlue: '#483D8B',
  dimGray: '#696969', dodgerBlue: '#1E90FF',
  forestGreen: '#228B22', fuchsia: '#FF00FF', gold: '#FFD700',
  gray: '#808080', green: '#008000', hotPink: '#FF69B4',
  indigo: '#4B0082', ivory: '#FFFFF0', khaki: '#F0E68C',
  lavender: '#E6E6FA', limeGreen: '#32CD32', magenta: '#FF00FF',
  maroon: '#800000', navy: '#000080', olive: '#808000',
  orange: '#FFA500', orangeRed: '#FF4500', orchid: '#DA70D6',
  pink: '#FFC0CB', plum: '#DDA0DD', purple: '#800080',
  red: '#FF0000', royalBlue: '#4169E1', salmon: '#FA8072',
  silver: '#C0C0C0', skyBlue: '#87CEEB', slateBlue: '#6A5ACD',
  slateGray: '#708090', tan: '#D2B48C', teal: '#008080',
  tomato: '#FF6347', turquoise: '#40E0D0', violet: '#EE82EE',
  white: '#FFFFFF', yellow: '#FFFF00', yellowGreen: '#9ACD32',
}
