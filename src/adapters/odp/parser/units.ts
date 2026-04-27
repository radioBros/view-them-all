// Convert ODF length string ("5.08cm", "2in", "144pt", "5080000") to EMU (integer)
// EMU = English Metric Unit: 914400 per inch, 360000 per cm
export function odfLengthToEmu(value: string | null): number {
  if (!value) return 0
  const n = parseFloat(value)
  if (isNaN(n)) return 0
  if (value.endsWith('cm'))  return Math.round(n * 360000)
  if (value.endsWith('in'))  return Math.round(n * 914400)
  if (value.endsWith('pt'))  return Math.round(n * 12700)   // 1pt = 12700 EMU
  if (value.endsWith('mm'))  return Math.round(n * 36000)
  return Math.round(n)  // already a number (e.g. already EMU)
}
