import type JSZip from 'jszip'
import type { ThemeColors } from '../parser/theme'
import type { RelMap } from '../parser/relationships'
import type { PlaceholderMap } from '../parser/layout'
import { resolveColorEl } from '../parser/theme'
import { getMasterDefaultFontSize, getMasterDefaultTextColor } from '../parser/layout'
import { parseRelationships } from '../parser/relationships'
import { parseXml, qs, qsAll, REL_NS } from '../xml'
import { resolvePath } from '../utils'

// ── Constants ─────────────────────────────────────────────────────────────────

const EMU_PX = 96 / 914400   // EMU → CSS px at 96 DPI
const PT_PX  = 96 / 72       // pt  → CSS px

const IMG_MIME: Record<string, string> = {
  png:  'image/png',
  jpg:  'image/jpeg',  jpeg: 'image/jpeg',
  gif:  'image/gif',   bmp:  'image/bmp',
  webp: 'image/webp',  svg:  'image/svg+xml',
  tiff: 'image/tiff',  tif:  'image/tiff',
}
// Browser-unrenderable Windows metafile formats — need special extraction
const SKIP_IMG = new Set(['emf', 'wmf', 'wdp'])

// ── Helpers ───────────────────────────────────────────────────────────────────

const epx = (emu: number) => (emu * EMU_PX).toFixed(1)
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function relsPathFor(zipPath: string): string {
  const d = zipPath.lastIndexOf('/')
  return `${zipPath.slice(0, d)}/_rels/${zipPath.slice(d + 1)}.rels`
}

async function loadZipString(zip: JSZip, path: string): Promise<string | null> {
  try {
    const f = zip.file(path)
    return f ? await f.async('string') : null
  } catch { return null }
}

// ── EMF → SVG vector renderer ─────────────────────────────────────────────────
// Converts a Windows Enhanced Metafile to an inline SVG string by replaying
// the GDI drawing records. Handles the subset produced by Office applications.

function emfToSvg(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer)
  if (bytes.length < 88 || view.getUint32(0, true) !== 1) return null

  const boundsL = view.getInt32( 8, true), boundsT = view.getInt32(12, true)
  const boundsR = view.getInt32(16, true), boundsB = view.getInt32(20, true)
  const vpW = boundsR - boundsL, vpH = boundsB - boundsT
  if (vpW <= 0 || vpH <= 0) return null

  // GDI object table
  type GBrush = { k: 'b'; c: string; s: number }
  type GPen   = { k: 'p'; c: string; w: number; s: number }
  type GFont  = { k: 'f'; nm: string; sz: number; bold: boolean; ital: boolean }
  type GObj = GBrush | GPen | GFont
  const objs: (GObj | null)[] = []

  // DC state
  let brush: GBrush | null = null
  let pen:   GPen   | null = null
  let font:  GFont  | null = null
  let textColor = '#000000'
  let textAlign = 0
  let bkMode    = 1    // 1=TRANSPARENT, 2=OPAQUE
  let fillMode  = 'evenodd'
  let curX = 0, curY = 0
  let inPath = false, pathD = ''

  // Window ↔ viewport transform (logical → device coords)
  let wox = 0, woy = 0, wex = 1, wey = 1
  let vox = 0, voy = 0, vex = 1, vey = 1

  const lx = (v: number) => wex ? vox + (v - wox) * vex / wex : vox
  const ly = (v: number) => wey ? voy + (v - woy) * vey / wey : voy
  const lw = (v: number) => wex ? Math.abs(v * vex / wex) : 0
  const lh = (v: number) => wey ? Math.abs(v * vey / wey) : 0
  const cref = (o: number) => `rgb(${bytes[o]!},${bytes[o+1]!},${bytes[o+2]!})`

  const getFill   = () => (!brush || brush.s === 1) ? 'none' : brush.c
  const getStroke = () => (!pen   || pen.s   === 5) ? { s: 'none', w: 0 }
                                                     : { s: pen.c, w: Math.max(lw(pen.w), pen.w > 0 ? 0.5 : 0) }
  const shapeAttrs = () => {
    const { s, w } = getStroke()
    const cp = curClip ? ` clip-path="url(#${curClip})"` : ''
    return `fill="${getFill()}" fill-rule="${fillMode}" stroke="${s}" stroke-width="${w}"${cp}`
  }

  const svgEls: string[] = []
  const defs:   string[] = []
  let clipIdx = 0, curClip = ''

  // Save/restore DC stack
  const snapshot = () => ({ brush, pen, font, textColor, textAlign, bkMode, fillMode,
    curX, curY, inPath, pathD, wox, woy, wex, wey, vox, voy, vex, vey, curClip })
  type DCSnap = ReturnType<typeof snapshot>
  const saveStack: DCSnap[] = []
  const restore  = (s: DCSnap) => {
    brush=s.brush; pen=s.pen; font=s.font; textColor=s.textColor; textAlign=s.textAlign
    bkMode=s.bkMode; fillMode=s.fillMode; curX=s.curX; curY=s.curY
    inPath=s.inPath; pathD=s.pathD
    wox=s.wox; woy=s.woy; wex=s.wex; wey=s.wey
    vox=s.vox; voy=s.voy; vex=s.vex; vey=s.vey; curClip=s.curClip
  }

  const readWStr = (o: number, n: number) => {
    let s = ''
    for (let i = 0; i < n; i++) {
      const c = view.getUint16(o + i*2, true)
      if (c === 0) break
      s += String.fromCharCode(c)
    }
    return s
  }

  let off = 0
  while (off + 8 <= bytes.length) {
    const rt = view.getUint32(off, true)
    const rs = view.getUint32(off + 4, true)
    if (rs < 8 || off + rs > bytes.length) break

    switch (rt) {
      // ── Coordinate system ──────────────────────────────────────────────────
      case  9: wex = view.getInt32(off+8,true);  wey = view.getInt32(off+12,true); break
      case 10: wox = view.getInt32(off+8,true);  woy = view.getInt32(off+12,true); break
      case 11: vex = view.getInt32(off+8,true);  vey = view.getInt32(off+12,true); break
      case 12: vox = view.getInt32(off+8,true);  voy = view.getInt32(off+12,true); break

      // ── DC state ───────────────────────────────────────────────────────────
      case 18: bkMode    = view.getUint32(off+8, true); break
      case 19: fillMode  = view.getUint32(off+8, true) === 2 ? 'nonzero' : 'evenodd'; break
      case 22: textAlign = view.getUint32(off+8, true); break
      case 24: textColor = cref(off+8); break
      case 33: saveStack.push(snapshot()); break  // SAVEDC
      case 34: {                                    // RESTOREDC
        const n = view.getInt32(off+8, true)
        const idx = n < 0 ? saveStack.length + n : n - 1
        const s = saveStack[Math.max(0, idx)]
        if (s) { saveStack.splice(Math.max(0, idx)); restore(s) }
        break
      }

      // ── Path bracket ───────────────────────────────────────────────────────
      case 59: inPath = true;  pathD = ''; break  // BEGINPATH
      case 60: inPath = false;             break  // ENDPATH
      case 61: pathD += 'Z ';             break  // CLOSEFIGURE

      // ── Object creation ────────────────────────────────────────────────────
      case 38: { // CREATEPEN: ihPen(4), lopnStyle(4), lopnWidth.x(4), lopnWidth.y(4), lopnColor(4)
        const i=view.getUint32(off+8,true), s=view.getUint32(off+12,true)
        const w=view.getInt32(off+16,true), c=cref(off+24)
        while (objs.length<=i) objs.push(null)
        objs[i]={ k:'p', c, w:Math.max(w,0), s }; break
      }
      case 95: { // EXTCREATEPEN: ihPen(4), offBmi(4), cbBmi(4), offBits(4), cbBits(4), EXTLOGPEN@28
        const i=view.getUint32(off+8,true)
        const s=(view.getUint32(off+28,true))&0xF, w=view.getUint32(off+32,true), c=cref(off+40)
        while (objs.length<=i) objs.push(null)
        objs[i]={ k:'p', c, w:Math.max(w,0), s }; break
      }
      case 39: { // CREATEBRUSHINDIRECT: ihBrush(4), lbStyle(4), lbColor(4), lbHatch(4)
        const i=view.getUint32(off+8,true), s=view.getUint32(off+12,true), c=cref(off+16)
        while (objs.length<=i) objs.push(null)
        objs[i]={ k:'b', c, s }; break
      }
      case 82: { // EXTCREATEFONTINDIRECTW: ihFont(4), LOGFONTW@12 (lfHeight@12, lfWeight@28, lfItalic@32, faceName@40)
        const i=view.getUint32(off+8,true), h=view.getInt32(off+12,true)
        const wt=view.getInt32(off+28,true), it=bytes[off+32]!
        const nm=readWStr(off+40,32)||'sans-serif'
        while (objs.length<=i) objs.push(null)
        objs[i]={ k:'f', nm, sz:Math.abs(lh(h)), bold:wt>=700, ital:it!==0 }; break
      }
      case 40: { // DELETEOBJECT
        const i=view.getUint32(off+8,true); if(i<objs.length) objs[i]=null; break
      }
      case 37: { // SELECTOBJECT
        const i=view.getUint32(off+8,true)
        if (i&0x80000000) {
          const si=i&0x7FFFFFFF
          if      (si===0) brush={k:'b',c:'#ffffff',s:0}
          else if (si===1) brush={k:'b',c:'#c0c0c0',s:0}
          else if (si===2) brush={k:'b',c:'#808080',s:0}
          else if (si===3) brush={k:'b',c:'#404040',s:0}
          else if (si===4) brush={k:'b',c:'#000000',s:0}
          else if (si===5) brush={k:'b',c:'none',s:1}
          else if (si===6) pen  ={k:'p',c:'#ffffff',w:1,s:0}
          else if (si===7) pen  ={k:'p',c:'#000000',w:1,s:0}
          else if (si===8) pen  ={k:'p',c:'none',w:0,s:5}
        } else {
          const obj=i<objs.length?objs[i]:null
          if (!obj) break
          if      (obj.k==='b') brush=obj
          else if (obj.k==='p') pen  =obj
          else if (obj.k==='f') font =obj
        }
        break
      }

      // ── Movement & lines ───────────────────────────────────────────────────
      case 27: { // MOVETOEX
        curX=lx(view.getInt32(off+8,true)); curY=ly(view.getInt32(off+12,true))
        if (inPath) pathD+=`M ${curX.toFixed(2)} ${curY.toFixed(2)} `
        break
      }
      case 54: { // LINETO
        const nx=lx(view.getInt32(off+8,true)), ny=ly(view.getInt32(off+12,true))
        if (inPath) { pathD+=`L ${nx.toFixed(2)} ${ny.toFixed(2)} ` }
        else { const {s,w}=getStroke(); if(s!=='none') svgEls.push(`<line x1="${curX.toFixed(2)}" y1="${curY.toFixed(2)}" x2="${nx.toFixed(2)}" y2="${ny.toFixed(2)}" stroke="${s}" stroke-width="${w}"/>`) }
        curX=nx; curY=ny; break
      }

      // ── Polyline variants ──────────────────────────────────────────────────
      case  6: { // POLYLINETO (32-bit): Bounds(16), Count(4), pts×8
        const n=view.getUint32(off+24,true); let po=off+28
        if (inPath) { for(let i=0;i<n;i++,po+=8) pathD+=`L ${lx(view.getInt32(po,true)).toFixed(2)} ${ly(view.getInt32(po+4,true)).toFixed(2)} ` }
        else { const {s,w}=getStroke(); let d=`M ${curX.toFixed(2)} ${curY.toFixed(2)} `
          for(let i=0;i<n;i++,po+=8){const nx=lx(view.getInt32(po,true)),ny=ly(view.getInt32(po+4,true));d+=`L ${nx.toFixed(2)} ${ny.toFixed(2)} `;curX=nx;curY=ny}
          if(s!=='none') svgEls.push(`<path d="${d}" fill="none" stroke="${s}" stroke-width="${w}"/>`) }
        break
      }
      case 89: { // POLYLINETO16: Bounds(16), Count(4), pts×4
        const n=view.getUint32(off+24,true); let po=off+28
        if (inPath) { for(let i=0;i<n;i++,po+=4) pathD+=`L ${lx(view.getInt16(po,true)).toFixed(2)} ${ly(view.getInt16(po+2,true)).toFixed(2)} ` }
        else { const {s,w}=getStroke(); let d=`M ${curX.toFixed(2)} ${curY.toFixed(2)} `
          for(let i=0;i<n;i++,po+=4){const nx=lx(view.getInt16(po,true)),ny=ly(view.getInt16(po+2,true));d+=`L ${nx.toFixed(2)} ${ny.toFixed(2)} `;curX=nx;curY=ny}
          if(s!=='none') svgEls.push(`<path d="${d}" fill="none" stroke="${s}" stroke-width="${w}"/>`) }
        break
      }

      // ── Bezier variants ────────────────────────────────────────────────────
      case  5: { // POLYBEZIERTO (32-bit): Bounds(16), Count(4), pts×8 (triplets)
        const n=view.getUint32(off+24,true); let po=off+28
        for(let i=0;i<n;i+=3,po+=24) pathD+=`C ${lx(view.getInt32(po,true)).toFixed(2)} ${ly(view.getInt32(po+4,true)).toFixed(2)} ${lx(view.getInt32(po+8,true)).toFixed(2)} ${ly(view.getInt32(po+12,true)).toFixed(2)} ${lx(view.getInt32(po+16,true)).toFixed(2)} ${ly(view.getInt32(po+20,true)).toFixed(2)} `
        break
      }
      case 88: { // POLYBEZIERTO16: Bounds(16), Count(4), pts×4 (triplets)
        const n=view.getUint32(off+24,true); let po=off+28
        for(let i=0;i<n;i+=3,po+=12) pathD+=`C ${lx(view.getInt16(po,true)).toFixed(2)} ${ly(view.getInt16(po+2,true)).toFixed(2)} ${lx(view.getInt16(po+4,true)).toFixed(2)} ${ly(view.getInt16(po+6,true)).toFixed(2)} ${lx(view.getInt16(po+8,true)).toFixed(2)} ${ly(view.getInt16(po+10,true)).toFixed(2)} `
        break
      }

      // ── Polygon variants ───────────────────────────────────────────────────
      case  3: { // POLYGON (32-bit): Bounds(16), Count(4), pts×8
        const n=view.getUint32(off+24,true); let d=''
        for(let i=0;i<n;i++) d+=(i?'L ':'M ')+`${lx(view.getInt32(off+28+i*8,true)).toFixed(2)} ${ly(view.getInt32(off+28+i*8+4,true)).toFixed(2)} `
        svgEls.push(`<path d="${d}Z" ${shapeAttrs()}/>`); break
      }
      case 86: { // POLYGON16: Bounds(16), Count(4), pts×4
        const n=view.getUint32(off+24,true); let d=''
        for(let i=0;i<n;i++) d+=(i?'L ':'M ')+`${lx(view.getInt16(off+28+i*4,true)).toFixed(2)} ${ly(view.getInt16(off+28+i*4+2,true)).toFixed(2)} `
        svgEls.push(`<path d="${d}Z" ${shapeAttrs()}/>`); break
      }
      case  8: { // POLYPOLYGON (32-bit): Bounds(16), nPolys(4), totalPts(4), counts[]×4, pts×8
        const np=view.getUint32(off+24,true); let ptOff=off+32+np*4; let d=''
        for(let p=0;p<np;p++){const n=view.getUint32(off+32+p*4,true)
          for(let i=0;i<n;i++,ptOff+=8) d+=(i?'L ':'M ')+`${lx(view.getInt32(ptOff,true)).toFixed(2)} ${ly(view.getInt32(ptOff+4,true)).toFixed(2)} `; d+='Z '}
        svgEls.push(`<path d="${d}" ${shapeAttrs()}/>`); break
      }
      case 91: { // POLYPOLYGON16: Bounds(16), nPolys(4), totalPts(4), counts[]×4, pts×4
        const np=view.getUint32(off+24,true); let ptOff=off+32+np*4; let d=''
        for(let p=0;p<np;p++){const n=view.getUint32(off+32+p*4,true)
          for(let i=0;i<n;i++,ptOff+=4) d+=(i?'L ':'M ')+`${lx(view.getInt16(ptOff,true)).toFixed(2)} ${ly(view.getInt16(ptOff+2,true)).toFixed(2)} `; d+='Z '}
        svgEls.push(`<path d="${d}" ${shapeAttrs()}/>`); break
      }
      case  4: { // POLYLINE (32-bit): Bounds(16), Count(4), pts×8
        const n=view.getUint32(off+24,true); const {s,w}=getStroke(); let d=''
        for(let i=0;i<n;i++) d+=(i?'L ':'M ')+`${lx(view.getInt32(off+28+i*8,true)).toFixed(2)} ${ly(view.getInt32(off+28+i*8+4,true)).toFixed(2)} `
        if(s!=='none') svgEls.push(`<path d="${d}" fill="none" stroke="${s}" stroke-width="${w}"/>`); break
      }
      case 87: { // POLYLINE16: Bounds(16), Count(4), pts×4
        const n=view.getUint32(off+24,true); const {s,w}=getStroke(); let d=''
        for(let i=0;i<n;i++) d+=(i?'L ':'M ')+`${lx(view.getInt16(off+28+i*4,true)).toFixed(2)} ${ly(view.getInt16(off+28+i*4+2,true)).toFixed(2)} `
        if(s!=='none') svgEls.push(`<path d="${d}" fill="none" stroke="${s}" stroke-width="${w}"/>`); break
      }
      case  7: { // POLYPOLYLINE (32-bit): like POLYPOLYGON but no close
        const np=view.getUint32(off+24,true); let ptOff=off+32+np*4; const {s,w}=getStroke()
        for(let p=0;p<np;p++){const n=view.getUint32(off+32+p*4,true); let d=''
          for(let i=0;i<n;i++,ptOff+=8) d+=(i?'L ':'M ')+`${lx(view.getInt32(ptOff,true)).toFixed(2)} ${ly(view.getInt32(ptOff+4,true)).toFixed(2)} `
          if(s!=='none') svgEls.push(`<path d="${d}" fill="none" stroke="${s}" stroke-width="${w}"/>`)}
        break
      }
      case 90: { // POLYPOLYLINE16
        const np=view.getUint32(off+24,true); let ptOff=off+32+np*4; const {s,w}=getStroke()
        for(let p=0;p<np;p++){const n=view.getUint32(off+32+p*4,true); let d=''
          for(let i=0;i<n;i++,ptOff+=4) d+=(i?'L ':'M ')+`${lx(view.getInt16(ptOff,true)).toFixed(2)} ${ly(view.getInt16(ptOff+2,true)).toFixed(2)} `
          if(s!=='none') svgEls.push(`<path d="${d}" fill="none" stroke="${s}" stroke-width="${w}"/>`)}
        break
      }

      // ── Primitives ─────────────────────────────────────────────────────────
      case 43: { // RECTANGLE: Bounds(16), rclBox(16)
        const rl=lx(view.getInt32(off+24,true)),rt_=ly(view.getInt32(off+28,true))
        const rr=lx(view.getInt32(off+32,true)),rb=ly(view.getInt32(off+36,true))
        svgEls.push(`<rect x="${Math.min(rl,rr).toFixed(2)}" y="${Math.min(rt_,rb).toFixed(2)}" width="${Math.abs(rr-rl).toFixed(2)}" height="${Math.abs(rb-rt_).toFixed(2)}" ${shapeAttrs()}/>`); break
      }
      case 44: { // ROUNDRECT: Bounds(16), rclBox(16), szlCorner(8)
        const rl=lx(view.getInt32(off+24,true)),rt_=ly(view.getInt32(off+28,true))
        const rr=lx(view.getInt32(off+32,true)),rb=ly(view.getInt32(off+36,true))
        const rx=lw(view.getInt32(off+40,true))/2, ry=lh(view.getInt32(off+44,true))/2
        svgEls.push(`<rect x="${Math.min(rl,rr).toFixed(2)}" y="${Math.min(rt_,rb).toFixed(2)}" width="${Math.abs(rr-rl).toFixed(2)}" height="${Math.abs(rb-rt_).toFixed(2)}" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}" ${shapeAttrs()}/>`); break
      }
      case 42: { // ELLIPSE: Bounds(16), rclBox(16)
        const rl=lx(view.getInt32(off+24,true)),rt_=ly(view.getInt32(off+28,true))
        const rr=lx(view.getInt32(off+32,true)),rb=ly(view.getInt32(off+36,true))
        const cx=(rl+rr)/2,cy=(rt_+rb)/2,rx_=Math.abs(rr-rl)/2,ry_=Math.abs(rb-rt_)/2
        svgEls.push(`<ellipse cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" rx="${rx_.toFixed(2)}" ry="${ry_.toFixed(2)}" ${shapeAttrs()}/>`); break
      }

      // ── Path fill/stroke ───────────────────────────────────────────────────
      case 62: { // FILLPATH
        if(pathD){ svgEls.push(`<path d="${pathD}" fill="${getFill()}" fill-rule="${fillMode}" stroke="none"/>`); pathD='' }; break
      }
      case 64: { // STROKEPATH
        if(pathD){ const {s,w}=getStroke(); svgEls.push(`<path d="${pathD}" fill="none" stroke="${s}" stroke-width="${w}"/>`); pathD='' }; break
      }
      case 63: { // STROKEANDFILLPATH
        if(pathD){ const {s,w}=getStroke(); svgEls.push(`<path d="${pathD}" fill="${getFill()}" fill-rule="${fillMode}" stroke="${s}" stroke-width="${w}"/>`); pathD='' }; break
      }
      case 67: { // SELECTCLIPPATH — use current path as a clip region
        if(pathD){
          const id=`emc${++clipIdx}`
          defs.push(`<clipPath id="${id}"><path d="${pathD}" fill-rule="${fillMode}"/></clipPath>`)
          curClip=id; pathD=''
        }; break
      }

      // ── Text ───────────────────────────────────────────────────────────────
      case 84: case 83: { // EXTTEXTOUTW / EXTTEXTOUTA
        // Bounds(16), iGraphicsMode(4), exScale(4), eyScale(4), EmrText: ptlRef(8), nChars(4), offStr(4)
        const tx_=lx(view.getInt32(off+28,true)), ty_=ly(view.getInt32(off+32,true))
        const nc=view.getUint32(off+36,true), ostr=view.getUint32(off+40,true)
        const str = rt===84 ? readWStr(off+ostr, nc) : (() => {
          let s=''; for(let i=0;i<nc;i++){const c=bytes[off+ostr+i]!;if(c===0)break;s+=String.fromCharCode(c)}; return s
        })()
        if (!str) break
        const sz=(font?.sz??12).toFixed(2), fam=(font?.nm??'sans-serif').replace(/'/g,'"')
        const fw=font?.bold?'bold':'normal', fi=font?.ital?'italic':'normal'
        const ta=(textAlign&6)===2?'end':(textAlign&6)===6?'middle':'start'
        const db=(textAlign&0x18)===0?' dominant-baseline="text-before-edge"':
                 (textAlign&0x18)===8?' dominant-baseline="text-after-edge"':''
        const se=str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        svgEls.push(`<text x="${tx_.toFixed(2)}" y="${ty_.toFixed(2)}" font-family="${fam}" font-size="${sz}" font-weight="${fw}" font-style="${fi}" fill="${textColor}" text-anchor="${ta}"${db}>${se}</text>`)
        break
      }

      // ── Bitmap records (raster fallback) ───────────────────────────────────
      case 81: case 76: case 80: break  // handled separately in tryExtractEmfBitmap
    }
    off += rs
  }

  if (svgEls.length === 0) return null
  const defsStr = defs.length ? `<defs>${defs.join('')}</defs>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${boundsL} ${boundsT} ${vpW} ${vpH}">${defsStr}${svgEls.join('')}</svg>`
}

// ── EMF bitmap / SVG extractor ────────────────────────────────────────────────
async function tryExtractEmfBitmap(
  file: JSZip['files'][string],
): Promise<{ b64: string; mime: string } | { diagnostic: string } | null> {
  let rawB64: string
  try { rawB64 = await file.async('base64') } catch { return null }

  let bytes: Uint8Array
  try {
    const raw = atob(rawB64)
    bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)!
  } catch { return null }

  if (bytes.length < 8) return null
  const view = new DataView(bytes.buffer)
  if (view.getUint32(0, true) !== 1) return null  // not an EMF

  // Pass 1: scan for embedded raster bitmaps (requires canvas)
  if (typeof document !== 'undefined') {
    let offset = 0
    while (offset + 8 <= bytes.length) {
      const recType = view.getUint32(offset, true)
      const recSize = view.getUint32(offset + 4, true)
      if (recSize < 8 || offset + recSize > bytes.length) break
      if (recType === 81 && recSize >= 80) { const r=extractDib(bytes,view,offset,48); if(r&&'b64'in r) return r }
      if (recType === 76 && recSize >= 100){ const r=extractDib(bytes,view,offset,84); if(r&&'b64'in r) return r }
      if (recType === 80 && recSize >= 64) { const r=extractDib(bytes,view,offset,48); if(r&&'b64'in r) return r }
      offset += recSize
    }
  }

  // Pass 2: vector render to SVG
  const svg = emfToSvg(bytes)
  if (svg) {
    const enc = new TextEncoder()
    return { b64: uint8ToBase64(enc.encode(svg)), mime: 'image/svg+xml' }
  }

  return { diagnostic: 'EMF: no renderable content' }
}

function extractDib(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  bmiOffset: number,
): { b64: string; mime: string } | null {
  const offBmi  = view.getUint32(offset + bmiOffset,     true)
  const cbBmi   = view.getUint32(offset + bmiOffset + 4, true)
  const offBits = view.getUint32(offset + bmiOffset + 8, true)
  const cbBits  = view.getUint32(offset + bmiOffset + 12, true)
  if (cbBmi < 40 || cbBits === 0) return null
  const bmiAbs  = offset + offBmi
  const bitsAbs = offset + offBits
  if (bmiAbs + 40 > bytes.length || bitsAbs + cbBits > bytes.length) return null

  const biWidth       = view.getInt32(bmiAbs + 4,  true)
  const biHeight      = view.getInt32(bmiAbs + 8,  true)
  const biBitCount    = view.getUint16(bmiAbs + 14, true)
  const biCompression = view.getUint32(bmiAbs + 16, true)
  const W = Math.abs(biWidth), H = Math.abs(biHeight)
  const topDown = biHeight < 0

  if (biCompression === 4) {
    return { b64: uint8ToBase64(bytes.subarray(bitsAbs, bitsAbs + cbBits)), mime: 'image/jpeg' }
  }
  if (biCompression === 5) {
    return { b64: uint8ToBase64(bytes.subarray(bitsAbs, bitsAbs + cbBits)), mime: 'image/png' }
  }
  if ((biCompression === 0 || biCompression === 3) &&
      (biBitCount === 24 || biBitCount === 32) &&
      W > 0 && H > 0 && W <= 8192 && H <= 8192) {
    return dibToCanvas(bytes, bitsAbs, W, H, biBitCount, topDown)
  }
  return null
}

function uint8ToBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!)
  return btoa(s)
}

function dibToCanvas(
  bytes: Uint8Array,
  bitsAbs: number,
  W: number,
  H: number,
  bitCount: number,
  topDown: boolean,
): { b64: string; mime: string } | null {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const imgData = ctx.createImageData(W, H)
    const bpp    = bitCount >> 3
    const stride = Math.ceil(W * bpp / 4) * 4   // rows padded to 4-byte boundary
    for (let y = 0; y < H; y++) {
      const srcRow = topDown ? y : (H - 1 - y)
      for (let x = 0; x < W; x++) {
        const src = bitsAbs + srcRow * stride + x * bpp
        const dst = (y * W + x) * 4
        imgData.data[dst]     = bytes[src + 2]!  // R (DIBs are BGR)
        imgData.data[dst + 1] = bytes[src + 1]!  // G
        imgData.data[dst + 2] = bytes[src]!       // B
        imgData.data[dst + 3] = 255
      }
    }
    ctx.putImageData(imgData, 0, 0)
    const url = canvas.toDataURL('image/png')
    const m = url.match(/^data:([^;]+);base64,(.+)$/)
    return m ? { b64: m[2]!, mime: m[1]! } : null
  } catch { return null }
}

type Geom = { x: number; y: number; w: number; h: number }

function getGeom(el: Element, layoutPhs: PlaceholderMap, masterPhs: PlaceholderMap): Geom | null {
  const xfrm = qs(el, 'xfrm')
  if (xfrm) {
    const off = qs(xfrm, 'off'), ext = qs(xfrm, 'ext')
    if (off && ext) {
      const x = parseInt(off.getAttribute('x')  ?? '0', 10) || 0
      const y = parseInt(off.getAttribute('y')  ?? '0', 10) || 0
      const w = parseInt(ext.getAttribute('cx') ?? '0', 10)
      const h = parseInt(ext.getAttribute('cy') ?? '0', 10)
      if (w > 0 && h > 0) return { x, y, w, h }
    }
  }
  const ph = qs(el, 'ph')
  if (ph) {
    const idx  = ph.getAttribute('idx')
    const type = ph.getAttribute('type') ?? 'body'
    const g =
      (idx !== null ? layoutPhs.get(idx) : undefined) ??
      layoutPhs.get(type) ??
      (idx !== null ? masterPhs.get(idx) : undefined) ??
      masterPhs.get(type)
    if (g) return { x: g.x, y: g.y, w: g.width, h: g.height }
  }
  return null
}

// ── Text rendering ────────────────────────────────────────────────────────────

function renderRun(
  text: string,
  rPr: Element | null,
  defRPr: Element | null,
  themeColors: ThemeColors,
  defaultFontSizePt?: number,
  defaultColor?: string,
): string {
  let bold = false, italic = false, underline = false, strike = false
  let color: string | undefined
  let fontSize: number | undefined
  let fontFamily: string | undefined

  const applyProps = (pr: Element) => {
    if (!bold)      { const v = pr.getAttribute('b');      if (v === '1' || v === 'true')  bold = true }
    if (!italic)    { const v = pr.getAttribute('i');      if (v === '1' || v === 'true')  italic = true }
    if (!underline) { const v = pr.getAttribute('u');      if (v && v !== 'none')           underline = true }
    if (!strike)    { const v = pr.getAttribute('strike'); if (v === 'sngStrike' || v === 'dblStrike') strike = true }
    if (!fontSize) {
      const sz = pr.getAttribute('sz')
      if (sz) { const v = parseInt(sz, 10); if (v > 0) fontSize = v / 100 }
    }
    if (!fontFamily) {
      const lat = qs(pr, 'latin')
      if (lat) { const tf = lat.getAttribute('typeface'); if (tf && !tf.startsWith('+')) fontFamily = tf }
    }
    if (!color) {
      const sf = qs(pr, 'solidFill')
      if (sf) color = resolveColorEl(sf, themeColors)
    }
  }

  if (rPr)   applyProps(rPr)
  if (defRPr) applyProps(defRPr)
  if (!fontSize && defaultFontSizePt) fontSize = defaultFontSizePt
  if (!color    && defaultColor)      color    = defaultColor

  const styles: string[] = []
  if (bold)       styles.push('font-weight:700')
  if (italic)     styles.push('font-style:italic')
  if (underline && !strike) styles.push('text-decoration:underline')
  if (strike && !underline) styles.push('text-decoration:line-through')
  if (underline && strike)  styles.push('text-decoration:underline line-through')
  if (color)      styles.push(`color:${color}`)
  if (fontSize)   styles.push(`font-size:${(fontSize * PT_PX).toFixed(1)}px`)
  if (fontFamily) styles.push(`font-family:'${fontFamily}',sans-serif`)

  const escaped = esc(text)
  return styles.length ? `<span style="${styles.join(';')}">${escaped}</span>` : escaped
}

function renderTxBody(
  txBody: Element,
  themeColors: ThemeColors,
  defaultFontSizePt?: number,
  defaultColor?: string,
): string {
  const paras: string[] = []

  for (const para of qsAll(txBody, 'p')) {
    const pPr   = qs(para, 'pPr')
    const algn  = pPr?.getAttribute('algn')
    let   align = ''
    if (algn === 'ctr')  align = 'center'
    else if (algn === 'r')    align = 'right'
    else if (algn === 'just') align = 'justify'

    const lvl       = pPr ? (parseInt(pPr.getAttribute('lvl') ?? '0', 10) || 0) : 0
    const defRPr    = pPr ? qs(pPr, 'defRPr') : null
    const buNone    = pPr ? qs(pPr, 'buNone')  : null
    const buChar    = pPr ? qs(pPr, 'buChar')  : null
    const buAutoNum = pPr ? qs(pPr, 'buAutoNum') : null

    const inlines: string[] = []

    // Bullet character
    if (!buNone && (buChar || buAutoNum)) {
      const char = buChar ? (buChar.getAttribute('char') ?? '•') : '•'
      inlines.push(`<span style="margin-right:0.35em">${esc(char)}</span>`)
    }

    // Runs
    for (const run of qsAll(para, 'r')) {
      const tEl  = qs(run, 't')
      const text = tEl?.textContent ?? ''
      if (!text) continue
      inlines.push(renderRun(text, qs(run, 'rPr'), defRPr, themeColors, defaultFontSizePt, defaultColor))
    }

    // Line breaks
    for (const br of qsAll(para, 'br')) {
      void br
      inlines.push('<br>')
    }

    // Field elements (slide number, date)
    for (const fld of qsAll(para, 'fld')) {
      const t = qs(fld, 't')?.textContent
      if (t) inlines.push(esc(t))
    }

    const indent = lvl > 0 ? `padding-left:${lvl * 22}px;` : ''
    const talign = align ? `text-align:${align};` : ''

    if (inlines.length === 0) {
      paras.push(`<p style="margin:0;line-height:1.25;min-height:0.5em;${talign}${indent}"> </p>`)
    } else {
      paras.push(`<p style="margin:0;line-height:1.25;${talign}${indent}">${inlines.join('')}</p>`)
    }
  }

  return paras.join('')
}

// ── Shape renderers ───────────────────────────────────────────────────────────

function renderImagePlaceholder(geom: Geom, reason = ''): string {
  const { x, y, w, h } = geom
  const label = reason ? `<div style="font-size:9px;color:#999;padding:2px 4px;text-align:center;word-break:break-all;max-width:100%;overflow:hidden">${esc(reason)}</div>` : ''
  return `<div style="position:absolute;left:${epx(x)}px;top:${epx(y)}px;width:${epx(w)}px;height:${epx(h)}px;background:rgba(0,0,0,0.06);display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;box-sizing:border-box"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>${label}</div>`
}


function renderTextShape(
  sp: Element,
  themeColors: ThemeColors,
  layoutPhs: PlaceholderMap,
  masterPhs: PlaceholderMap,
  masterDoc: Document | null,
  geomOverride?: Geom,
  blipBgStyle?: string,
): string | null {
  const geom = geomOverride ?? getGeom(sp, layoutPhs, masterPhs)
  if (!geom) return null

  const txBody = qs(sp, 'txBody')
  if (!txBody) return null

  // Shape background fill — solid color or passed-in image background
  let bgStyle = blipBgStyle ?? ''
  const spPr = qs(sp, 'spPr')
  if (spPr && !blipBgStyle) {
    const sf = qs(spPr, 'solidFill')
    if (sf) { const c = resolveColorEl(sf, themeColors); if (c) bgStyle = `background-color:${c};` }
  }

  // Shape border
  let borderStyle = ''
  if (spPr) {
    const ln = qs(spPr, 'ln')
    if (ln) {
      const w   = parseInt(ln.getAttribute('w') ?? '0', 10) || 0
      const sf  = qs(ln, 'solidFill')
      const noFill = qs(ln, 'noFill')
      if (!noFill && w > 0 && sf) {
        const c = resolveColorEl(sf, themeColors)
        if (c) borderStyle = `border:${(w * EMU_PX).toFixed(1)}px solid ${c};`
      }
    }
  }

  // Vertical alignment
  const bodyPr = qs(txBody, 'bodyPr')
  const anchor = bodyPr?.getAttribute('anchor')
  let jc = 'flex-start'
  if (anchor === 'ctr')  jc = 'center'
  else if (anchor === 'b') jc = 'flex-end'

  // Internal padding from inset attributes (in EMU)
  const marL = parseInt(bodyPr?.getAttribute('marL') ?? '91440',  10)
  const marR = parseInt(bodyPr?.getAttribute('marR') ?? '91440',  10)
  const marT = parseInt(bodyPr?.getAttribute('marT') ?? '45720',  10)
  const marB = parseInt(bodyPr?.getAttribute('marB') ?? '45720',  10)
  const padStyle = `padding:${epx(marT)}px ${epx(marR)}px ${epx(marB)}px ${epx(marL)}px;`

  // Master placeholder defaults
  const ph    = qs(sp, 'ph')
  const phType = ph?.getAttribute('type') ?? (ph ? 'body' : '')
  const defFontSizePt = phType ? getMasterDefaultFontSize(masterDoc, phType)              : undefined
  const defColor      = phType ? getMasterDefaultTextColor(masterDoc, phType, themeColors) : undefined

  const content = renderTxBody(txBody, themeColors, defFontSizePt, defColor)

  const { x, y, w, h } = geom
  return `<div style="position:absolute;left:${epx(x)}px;top:${epx(y)}px;width:${epx(w)}px;height:${epx(h)}px;overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column;justify-content:${jc};${padStyle}${bgStyle}${borderStyle}">${content}</div>`
}

async function renderPicShape(
  pic: Element,
  zip: JSZip,
  zipBasePath: string,
  rels: RelMap,
  layoutPhs: PlaceholderMap,
  masterPhs: PlaceholderMap,
  geomOverride?: Geom,
): Promise<string | null> {
  const geom = geomOverride ?? getGeom(pic, layoutPhs, masterPhs)
  if (!geom) return null
  const blipFill = qs(pic, 'blipFill')
  if (!blipFill) return null
  const img = await loadBlipImage(blipFill, zip, zipBasePath, rels)
  if (!img) return null
  if ('skip' in img) return renderImagePlaceholder(geom, img.skip)
  const { x, y, w, h } = geom
  return `<div style="position:absolute;left:${epx(x)}px;top:${epx(y)}px;width:${epx(w)}px;height:${epx(h)}px;overflow:hidden"><img src="data:${img.mime};base64,${img.b64}" style="width:100%;height:100%;object-fit:${img.objectFit}" alt="" loading="lazy"/></div>`
}

type BlipResult = { b64: string; mime: string; objectFit: string } | { skip: string } | null

// Shared image loader.
// Returns image data, { skip: reason } (valid ref but can't render), or null (no ref at all).
async function loadBlipImage(
  blipFill: Element,
  zip: JSZip,
  zipBasePath: string,
  rels: RelMap,
): Promise<BlipResult> {
  const blip = qs(blipFill, 'blip')
  if (!blip) return null

  // Linked image (r:link) — file is not in the ZIP, can't render
  const rLink = blip.getAttributeNS(REL_NS, 'link') ?? blip.getAttribute('r:link')
  if (rLink) return { skip: `linked image (r:link=${rLink})` }

  const rId = blip.getAttributeNS(REL_NS, 'embed') ?? blip.getAttribute('r:embed')
  if (!rId) return null

  const rel = rels.get(rId)
  if (!rel) return { skip: `rId ${rId} not in rels map (base=${zipBasePath})` }

  const imgPath = resolvePath(zipBasePath, rel.target)
  const ext     = imgPath.split('.').pop()?.toLowerCase() ?? ''
  const mime = IMG_MIME[ext]
  if (!mime && !SKIP_IMG.has(ext)) return { skip: `unknown MIME for ext: ${ext} (${imgPath})` }
  const imgFile = zip.file(imgPath)
  if (!imgFile) return { skip: `file not found in ZIP: ${imgPath}` }

  if (SKIP_IMG.has(ext)) {
    // Try to extract a renderable bitmap from EMF/WMF before giving up
    const extracted = await tryExtractEmfBitmap(imgFile)
    if (extracted && 'b64' in extracted) return { ...extracted, objectFit: 'contain' }
    if (extracted && 'diagnostic' in extracted)
      return { skip: `${ext}: ${extracted.diagnostic}` }
    return { skip: `unrenderable format: ${ext} (${imgPath})` }
  }

  let b64: string
  try {
    b64 = await imgFile.async('base64')
  } catch (e) {
    return { skip: `ZIP read error: ${e}` }
  }
  const objectFit = qs(blipFill, 'stretch') ? 'fill' : 'contain'
  return { b64, mime: mime!, objectFit }
}

// Render a <p:sp> whose spPr contains a blipFill (image-filled shape with no text)
async function renderSpAsImage(
  sp: Element,
  blipFill: Element,
  zip: JSZip,
  zipBasePath: string,
  rels: RelMap,
  layoutPhs: PlaceholderMap,
  masterPhs: PlaceholderMap,
  geomOverride?: Geom,
): Promise<string | null> {
  const geom = geomOverride ?? getGeom(sp, layoutPhs, masterPhs)
  if (!geom) return null
  const img = await loadBlipImage(blipFill, zip, zipBasePath, rels)
  if (!img) return null
  if ('skip' in img) return renderImagePlaceholder(geom, img.skip)
  const { x, y, w, h } = geom
  return `<div style="position:absolute;left:${epx(x)}px;top:${epx(y)}px;width:${epx(w)}px;height:${epx(h)}px;overflow:hidden"><img src="data:${img.mime};base64,${img.b64}" style="width:100%;height:100%;object-fit:${img.objectFit}" alt="" loading="lazy"/></div>`
}

// ── SVG chart rendering ───────────────────────────────────────────────────────

const CHART_PALETTE = ['#4472C4','#ED7D31','#A9D18E','#FFC000','#5B9BD5','#70AD47','#255E91','#9E480E','#636363','#997300']

interface CSeries { name: string; vals: number[]; color: string }
interface CData   { type: string; title: string; cats: string[]; series: CSeries[] }

function parseChartData(chartDoc: Document, themeColors: ThemeColors): CData {
  const TYPES = ['barChart','lineChart','pieChart','doughnutChart','areaChart','scatterChart','radarChart','bubbleChart']
  let plotArea: Element | null = qs(chartDoc, 'plotArea')
  let typeEl: Element | null = null
  let type = 'barChart'
  for (const t of TYPES) {
    const el = plotArea ? qs(plotArea, t) : qs(chartDoc, t)
    if (el) { typeEl = el; type = t; break }
  }

  // Title — only look inside <c:title>, NOT the whole doc, to avoid grabbing series names
  let title = ''
  const titleEl = qs(chartDoc, 'title')
  if (titleEl) {
    title = qsAll(titleEl, 't').map(t => t.textContent ?? '').join('').trim()
  }

  const cats: string[] = []
  const series: CSeries[] = []
  // Only iterate series inside the detected chart type element
  const serEls = typeEl ? qsAll(typeEl, 'ser') : []

  serEls.forEach((ser, si) => {
    // Series name: look inside <c:tx> only
    const tx = qs(ser, 'tx')
    const name = tx ? qsAll(tx, 'v').map(v => v.textContent ?? '').join('').trim() || `S${si+1}` : `S${si+1}`

    // Series color
    let color = CHART_PALETTE[si % CHART_PALETTE.length]!
    const spPr = qs(ser, 'spPr')
    if (spPr) {
      const sf = qs(spPr, 'solidFill')
      if (sf) { const c = resolveColorEl(sf, themeColors); if (c) color = c }
    }

    // Categories (from first series only)
    if (si === 0) {
      const catEl = qs(ser, 'cat') ?? qs(ser, 'xVal')
      if (catEl) {
        const pts = qsAll(catEl, 'pt')
        if (pts.length > 0) pts.forEach(p => cats.push(qs(p, 'v')?.textContent?.trim() ?? ''))
        else qsAll(catEl, 'v').forEach(v => cats.push(v.textContent?.trim() ?? ''))
      }
    }

    // Values
    const valEl = qs(ser, 'val') ?? qs(ser, 'yVal')
    const vals: number[] = []
    if (valEl) {
      const pts = qsAll(valEl, 'pt')
      if (pts.length > 0) pts.forEach(p => vals.push(parseFloat(qs(p,'v')?.textContent ?? '0') || 0))
      else qsAll(valEl, 'v').forEach(v => vals.push(parseFloat(v.textContent ?? '0') || 0))
    }
    if (vals.length > 0) series.push({ name, vals, color })
  })

  if (cats.length === 0 && series.length > 0)
    for (let i = 0; i < Math.max(...series.map(s => s.vals.length)); i++) cats.push(`${i+1}`)

  return { type, title, cats, series }
}

function svgText(x: number, y: number, text: string, opts: Record<string, string> = {}): string {
  const attrs = Object.entries({ 'text-anchor':'start', fill:'#555', 'font-size':'10', ...opts })
    .map(([k,v]) => `${k}="${v}"`)
    .join(' ')
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${attrs}>${esc(text)}</text>`
}

function renderBarChartSvg(d: CData, W: number, H: number): string {
  const { cats, series, title } = d
  if (series.length === 0) return ''
  const mT = title ? 26 : 6, mB = 44, mL = 42, mR = 10
  const cw = W - mL - mR, ch = H - mT - mB
  const allV = series.flatMap(s => s.vals)
  const minV = Math.min(0, ...allV), maxV = Math.max(...allV, 1)
  const range = maxV - minV || 1
  const nC = cats.length || 1, nS = series.length
  const gW = cw / nC, bW = gW * 0.75 / nS, pad = gW * 0.125
  const xOf = (ci: number, si: number) => mL + ci * gW + pad + si * bW
  const yOf = (v: number) => mT + ch * (1 - (v - minV) / range)
  const z = yOf(0)
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="font-family:sans-serif">`]
  if (title) out.push(svgText(W/2, 17, title.length > 40 ? title.slice(0,39)+'…' : title, {'text-anchor':'middle','font-weight':'bold','font-size':'11','fill':'#333'}))
  for (let i = 0; i <= 4; i++) {
    const v = minV + range * i / 4, y = yOf(v)
    out.push(`<line x1="${mL}" y1="${y.toFixed(1)}" x2="${mL+cw}" y2="${y.toFixed(1)}" stroke="#e8e8e8" stroke-width="1"/>`)
    out.push(svgText(mL-4, y+3.5, (Number.isInteger(v)?v:v.toFixed(1)).toString(), {'text-anchor':'end','font-size':'8','fill':'#999'}))
  }
  out.push(`<line x1="${mL}" y1="${mT}" x2="${mL}" y2="${mT+ch}" stroke="#ccc" stroke-width="1"/>`)
  out.push(`<line x1="${mL}" y1="${z.toFixed(1)}" x2="${mL+cw}" y2="${z.toFixed(1)}" stroke="#bbb" stroke-width="1"/>`)
  for (let si = 0; si < series.length; si++) {
    const s = series[si]!
    for (let ci = 0; ci < s.vals.length; ci++) {
      const v = s.vals[ci]!, x = xOf(ci, si), y = Math.min(yOf(v), z), bh = Math.max(Math.abs(yOf(v) - z), 1)
      out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bW*0.92).toFixed(1)}" height="${bh.toFixed(1)}" fill="${s.color}" opacity="0.88"/>`)
    }
  }
  const step = Math.max(1, Math.ceil(cats.length / 8))
  for (let ci = 0; ci < cats.length; ci += step) {
    const x = mL + ci * gW + gW / 2, lbl = (cats[ci]??'')
    out.push(svgText(x, mT+ch+13, lbl.length>9?lbl.slice(0,8)+'…':lbl, {'text-anchor':'middle','font-size':'8','fill':'#777'}))
  }
  if (nS > 1) {
    const lw = Math.min(90, cw / nS)
    for (let si = 0; si < Math.min(nS, 8); si++) {
      const s = series[si]!, lx = mL + si * lw, ly = mT + ch + 24
      out.push(`<rect x="${lx}" y="${ly}" width="8" height="8" fill="${s.color}"/>`)
      out.push(svgText(lx+11, ly+8, s.name.length>10?s.name.slice(0,9)+'…':s.name, {'font-size':'8','fill':'#666'}))
    }
  }
  out.push('</svg>')
  return out.join('')
}

function renderLineChartSvg(d: CData, W: number, H: number): string {
  const { cats, series, title } = d
  if (series.length === 0) return ''
  const mT = title ? 26 : 6, mB = 40, mL = 42, mR = 10
  const cw = W - mL - mR, ch = H - mT - mB
  const allV = series.flatMap(s => s.vals)
  const minV = Math.min(0, ...allV), maxV = Math.max(...allV, 1), range = maxV - minV || 1
  const nP = Math.max(...series.map(s => s.vals.length), 2)
  const xOf = (i: number) => mL + (i / (nP - 1)) * cw
  const yOf = (v: number) => mT + ch * (1 - (v - minV) / range)
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="font-family:sans-serif">`]
  if (title) out.push(svgText(W/2, 17, title.length>40?title.slice(0,39)+'…':title, {'text-anchor':'middle','font-weight':'bold','font-size':'11','fill':'#333'}))
  for (let i = 0; i <= 4; i++) {
    const v = minV + range * i / 4, y = yOf(v)
    out.push(`<line x1="${mL}" y1="${y.toFixed(1)}" x2="${mL+cw}" y2="${y.toFixed(1)}" stroke="#e8e8e8" stroke-width="1"/>`)
    out.push(svgText(mL-4, y+3.5, (Number.isInteger(v)?v:v.toFixed(1)).toString(), {'text-anchor':'end','font-size':'8','fill':'#999'}))
  }
  out.push(`<line x1="${mL}" y1="${mT}" x2="${mL}" y2="${mT+ch}" stroke="#ccc" stroke-width="1"/>`)
  out.push(`<line x1="${mL}" y1="${mT+ch}" x2="${mL+cw}" y2="${mT+ch}" stroke="#ccc" stroke-width="1"/>`)
  for (const s of series) {
    const pts = s.vals.map((v,i) => `${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(' ')
    out.push(`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`)
    s.vals.forEach((v,i) => out.push(`<circle cx="${xOf(i).toFixed(1)}" cy="${yOf(v).toFixed(1)}" r="3" fill="${s.color}"/>`))
  }
  const step = Math.max(1, Math.ceil(cats.length / 7))
  for (let i = 0; i < cats.length; i += step) {
    const lbl = cats[i] ?? ''
    out.push(svgText(xOf(i), mT+ch+13, lbl.length>9?lbl.slice(0,8)+'…':lbl, {'text-anchor':'middle','font-size':'8','fill':'#777'}))
  }
  if (series.length > 1) {
    const lw = Math.min(90, cw / series.length)
    series.slice(0, 8).forEach((s, si) => {
      const lx = mL + si * lw, ly = mT + ch + 24
      out.push(`<line x1="${lx}" y1="${ly+4}" x2="${lx+12}" y2="${ly+4}" stroke="${s.color}" stroke-width="2"/>`)
      out.push(svgText(lx+14, ly+7, s.name.length>10?s.name.slice(0,9)+'…':s.name, {'font-size':'8','fill':'#666'}))
    })
  }
  out.push('</svg>')
  return out.join('')
}

function renderPieChartSvg(d: CData, W: number, H: number, isDoughnut: boolean): string {
  const { series, cats, title } = d
  const vals = series[0]?.vals ?? []
  if (vals.length === 0) return renderBarChartSvg(d, W, H)
  const total = vals.reduce((a, b) => a + Math.abs(b), 0) || 1
  const cx = W * 0.42, cy = H * 0.5
  const R = Math.min(W * 0.32, H * 0.42), iR = isDoughnut ? R * 0.48 : 0
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="font-family:sans-serif">`]
  if (title) out.push(svgText(W/2, 15, title.length>40?title.slice(0,39)+'…':title, {'text-anchor':'middle','font-weight':'bold','font-size':'11','fill':'#333'}))
  let angle = -Math.PI / 2
  for (let i = 0; i < vals.length; i++) {
    const slice = (Math.abs(vals[i]!) / total) * 2 * Math.PI
    const end = angle + slice, la = slice > Math.PI ? 1 : 0
    const color = CHART_PALETTE[i % CHART_PALETTE.length]!
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle)
    const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end)
    if (isDoughnut) {
      const ix1 = cx + iR * Math.cos(end), iy1 = cy + iR * Math.sin(end)
      const ix2 = cx + iR * Math.cos(angle), iy2 = cy + iR * Math.sin(angle)
      out.push(`<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${la},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${ix1.toFixed(1)},${iy1.toFixed(1)} A${iR},${iR} 0 ${la},0 ${ix2.toFixed(1)},${iy2.toFixed(1)} Z" fill="${color}" stroke="white" stroke-width="1.5"/>`)
    } else {
      out.push(`<path d="M${cx.toFixed(1)},${cy.toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${la},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z" fill="${color}" stroke="white" stroke-width="1.5"/>`)
    }
    const pct = Math.round(Math.abs(vals[i]!) / total * 100)
    if (pct >= 5) {
      const mid = angle + slice / 2, lr = R * (isDoughnut ? 0.72 : 0.62)
      out.push(svgText(cx + lr * Math.cos(mid), cy + lr * Math.sin(mid) + 4, `${pct}%`, {'text-anchor':'middle','fill':'white','font-weight':'bold','font-size':'9'}))
    }
    angle = end
  }
  const lx = cx + R + 14
  vals.slice(0, 10).forEach((_, i) => {
    const ly = cy - (Math.min(vals.length, 10) * 14) / 2 + i * 14
    const color = CHART_PALETTE[i % CHART_PALETTE.length]!
    const lbl = (cats[i] ?? series[0]?.name ?? `Item ${i+1}`)
    out.push(`<rect x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="9" height="9" fill="${color}"/>`)
    out.push(svgText(lx+12, ly+8.5, lbl.length>12?lbl.slice(0,11)+'…':lbl, {'font-size':'9','fill':'#555'}))
  })
  out.push('</svg>')
  return out.join('')
}

// Render a <p:graphicFrame> containing a chart — renders actual SVG chart
async function renderChartFrame(
  frame: Element,
  themeColors: ThemeColors,
  zip: JSZip,
  zipBasePath: string,
  rels: RelMap,
  layoutPhs: PlaceholderMap,
  masterPhs: PlaceholderMap,
  geomOverride?: Geom,
): Promise<string | null> {
  const geom = geomOverride ?? getGeom(frame, layoutPhs, masterPhs)
  if (!geom) return null

  const chartRef = qs(frame, 'chart')
  if (!chartRef) return null
  const rId = chartRef.getAttributeNS(REL_NS, 'id') ?? chartRef.getAttribute('r:id')
  if (!rId) return null
  const rel = rels.get(rId)
  if (!rel) return null

  const chartXml = await loadZipString(zip, resolvePath(zipBasePath, rel.target))
  if (!chartXml) return null
  let chartDoc: Document
  try { chartDoc = parseXml(chartXml) } catch { return null }

  const data = parseChartData(chartDoc, themeColors)
  const { x, y, w, h } = geom
  const W = w * EMU_PX, H = h * EMU_PX

  let svgContent = ''
  switch (data.type) {
    case 'lineChart':
    case 'areaChart':   svgContent = renderLineChartSvg(data, W, H); break
    case 'pieChart':    svgContent = renderPieChartSvg(data, W, H, false); break
    case 'doughnutChart': svgContent = renderPieChartSvg(data, W, H, true); break
    default:            svgContent = renderBarChartSvg(data, W, H); break
  }

  if (!svgContent) return null
  return `<div style="position:absolute;left:${epx(x)}px;top:${epx(y)}px;width:${W.toFixed(1)}px;height:${H.toFixed(1)}px;overflow:hidden">${svgContent}</div>`
}

function renderTableShape(
  frame: Element,
  themeColors: ThemeColors,
  layoutPhs: PlaceholderMap,
  masterPhs: PlaceholderMap,
  geomOverride?: Geom,
): string | null {
  const geom = geomOverride ?? getGeom(frame, layoutPhs, masterPhs)
  if (!geom) return null

  const tbl = qs(frame, 'tbl')
  if (!tbl) return null

  // Table-level border style from tblPr
  const tblPr    = qs(tbl, 'tblPr')
  const tblBg    = tblPr ? qs(tblPr, 'solidFill') : null
  const tblBgClr = tblBg ? resolveColorEl(tblBg, themeColors) : undefined

  // Column widths
  const colWidths: number[] = []
  const tblGrid = qs(tbl, 'tblGrid')
  if (tblGrid) {
    for (const gc of Array.from(tblGrid.children)) {
      if (gc.localName === 'gridCol') {
        colWidths.push(parseInt(gc.getAttribute('w') ?? '0', 10) * EMU_PX)
      }
    }
  }

  const rows: string[] = []
  for (const row of qsAll(tbl, 'tr')) {
    const rowH     = parseInt(row.getAttribute('h') ?? '0', 10)
    const rowHPx   = rowH > 0 ? `height:${(rowH * EMU_PX).toFixed(1)}px;` : ''
    const cells: string[] = []
    let colIdx = 0

    for (const tc of qsAll(row, 'tc')) {
      const tcPr     = qs(tc, 'tcPr')
      const txBody   = qs(tc, 'txBody')
      const content  = txBody ? renderTxBody(txBody, themeColors) : '&nbsp;'

      // Cell background
      let cellBg = ''
      if (tcPr) {
        const sf = qs(tcPr, 'solidFill')
        if (sf) { const c = resolveColorEl(sf, themeColors); if (c) cellBg = `background-color:${c};` }
      }

      // Cell border (simplified: all sides)
      let cellBorder = 'border:1px solid rgba(0,0,0,0.18);'
      if (tcPr) {
        const lnB = qs(tcPr, 'lnB') ?? qs(tcPr, 'ln')
        if (lnB) {
          const noFill = qs(lnB, 'noFill')
          const sf     = qs(lnB, 'solidFill')
          if (noFill) cellBorder = 'border:none;'
          else if (sf) {
            const c = resolveColorEl(sf, themeColors)
            if (c) cellBorder = `border:1px solid ${c};`
          }
        }
      }

      // Span attrs
      const gridSpan = tcPr ? parseInt(tcPr.getAttribute('gridSpan') ?? '1', 10) : 1
      const rowSpan  = tcPr ? parseInt(tcPr.getAttribute('rowSpan')  ?? '1', 10) : 1
      const spanAttrs = [
        gridSpan > 1 ? `colspan="${gridSpan}"` : '',
        rowSpan  > 1 ? `rowspan="${rowSpan}"`  : '',
      ].filter(Boolean).join(' ')

      // Column width
      let colW = ''
      if (colWidths[colIdx] !== undefined) colW = `width:${colWidths[colIdx]!.toFixed(1)}px;`
      colIdx += gridSpan

      cells.push(`<td ${spanAttrs} style="${cellBorder}padding:4px 8px;vertical-align:top;overflow:hidden;${cellBg}${colW}">${content}</td>`)
    }
    rows.push(`<tr style="${rowHPx}">${cells.join('')}</tr>`)
  }

  const { x, y, w, h } = geom
  const bgStyle = tblBgClr ? `background-color:${tblBgClr};` : ''

  return `<div style="position:absolute;left:${epx(x)}px;top:${epx(y)}px;width:${epx(w)}px;height:${epx(h)}px;overflow:hidden;${bgStyle}"><table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;font-size:inherit;box-sizing:border-box">${rows.join('')}</table></div>`
}

// ── Group shape ───────────────────────────────────────────────────────────────

type GroupTransform = { offX: number; offY: number; scaleX: number; scaleY: number; chOffX: number; chOffY: number }

function parseGrpTransform(grpSp: Element): GroupTransform | null {
  const grpSpPr = qs(grpSp, 'grpSpPr')
  if (!grpSpPr) return null
  const xfrm = qs(grpSpPr, 'xfrm')
  if (!xfrm) return null
  const off   = qs(xfrm, 'off'),   ext   = qs(xfrm, 'ext')
  const chOff = qs(xfrm, 'chOff'), chExt = qs(xfrm, 'chExt')
  if (!off || !ext || !chOff || !chExt) return null
  const grpCx = parseInt(ext.getAttribute('cx')   ?? '0', 10) || 0
  const grpCy = parseInt(ext.getAttribute('cy')   ?? '0', 10) || 0
  const chCx  = parseInt(chExt.getAttribute('cx') ?? '0', 10) || 0
  const chCy  = parseInt(chExt.getAttribute('cy') ?? '0', 10) || 0
  if (chCx === 0 || chCy === 0) return null
  return {
    offX:   parseInt(off.getAttribute('x')   ?? '0', 10) || 0,
    offY:   parseInt(off.getAttribute('y')   ?? '0', 10) || 0,
    scaleX: grpCx / chCx,
    scaleY: grpCy / chCy,
    chOffX: parseInt(chOff.getAttribute('x') ?? '0', 10) || 0,
    chOffY: parseInt(chOff.getAttribute('y') ?? '0', 10) || 0,
  }
}

function applyGrpTransform(geom: Geom, t: GroupTransform): Geom {
  return {
    x: Math.round(t.offX + (geom.x - t.chOffX) * t.scaleX),
    y: Math.round(t.offY + (geom.y - t.chOffY) * t.scaleY),
    w: Math.round(geom.w * t.scaleX),
    h: Math.round(geom.h * t.scaleY),
  }
}

// ── spTree walker ─────────────────────────────────────────────────────────────

async function renderSpTree(
  spTree: Element,
  themeColors: ThemeColors,
  zip: JSZip,
  zipBasePath: string,
  rels: RelMap,
  masterDoc: Document | null,
  layoutPhs: PlaceholderMap,
  masterPhs: PlaceholderMap,
  skipPlaceholders: boolean,
  parentTransform?: GroupTransform,
): Promise<string> {
  const parts: string[] = []

  for (const child of Array.from(spTree.children)) {
    const ln = child.localName

    if (ln === 'sp') {
      if (skipPlaceholders && qs(child, 'ph')) continue
      let geom = getGeom(child, layoutPhs, masterPhs)
      if (geom && parentTransform) geom = applyGrpTransform(geom, parentTransform)

      // Detect image fill in spPr
      const spPr     = qs(child, 'spPr')
      const blipFill = spPr ? qs(spPr, 'blipFill') : null
      if (blipFill) {
        const txBody  = qs(child, 'txBody')
        const hasText = txBody ? qsAll(txBody, 'r').some(r => (qs(r, 't')?.textContent ?? '').length > 0) : false
        if (!hasText) {
          // Pure image shape — render as picture
          const html = await renderSpAsImage(child, blipFill, zip, zipBasePath, rels, layoutPhs, masterPhs, geom ?? undefined)
          if (html) parts.push(html)
          continue
        } else {
          // Text shape with image background — load image, render as CSS background
          const imgResult = await loadBlipImage(blipFill, zip, zipBasePath, rels)
          const blipBgStyle = imgResult && !('skip' in imgResult)
            ? `background-image:url('data:${imgResult.mime};base64,${imgResult.b64}');background-size:${imgResult.objectFit === 'fill' ? '100% 100%' : 'cover'};background-position:center;background-repeat:no-repeat;`
            : undefined
          const html = renderTextShape(child, themeColors, layoutPhs, masterPhs, masterDoc, geom ?? undefined, blipBgStyle)
          if (html) parts.push(html)
          continue
        }
      }

      const html = renderTextShape(child, themeColors, layoutPhs, masterPhs, masterDoc, geom ?? undefined)
      if (html) parts.push(html)

    } else if (ln === 'pic') {
      let geom = getGeom(child, layoutPhs, masterPhs)
      if (geom && parentTransform) geom = applyGrpTransform(geom, parentTransform)
      const html = await renderPicShape(child, zip, zipBasePath, rels, layoutPhs, masterPhs, geom ?? undefined)
      if (html) parts.push(html)

    } else if (ln === 'graphicFrame') {
      let geom = getGeom(child, layoutPhs, masterPhs)
      if (geom && parentTransform) geom = applyGrpTransform(geom, parentTransform)
      const graphicData = qs(child, 'graphicData')
      const uri = graphicData?.getAttribute('uri') ?? ''
      if (uri === 'http://schemas.openxmlformats.org/drawingml/2006/chart' || uri.endsWith('/chart')) {
        const html = await renderChartFrame(child, themeColors, zip, zipBasePath, rels, layoutPhs, masterPhs, geom ?? undefined)
        if (html) parts.push(html)
      } else {
        // Try as table; if that fails (OLE/SmartArt/diagram), show placeholder
        const html = renderTableShape(child, themeColors, layoutPhs, masterPhs, geom ?? undefined)
        if (html) {
          parts.push(html)
        } else if (geom) {
          // Non-table graphicFrame (OLE object, SmartArt, diagram) — render placeholder
          parts.push(renderImagePlaceholder(geom))
        }
      }

    } else if (ln === 'AlternateContent') {
      // mc:AlternateContent — try Choice first, then Fallback
      const inner = qs(child, 'Choice') ?? qs(child, 'Fallback')
      if (inner) {
        const subHtml = await renderSpTree(
          inner, themeColors, zip, zipBasePath, rels, masterDoc,
          layoutPhs, masterPhs, skipPlaceholders, parentTransform,
        )
        parts.push(subHtml)
      }

    } else if (ln === 'grpSp') {
      const t = parseGrpTransform(child)
      // Compose transforms: if there's a parent transform, apply it to the group's offset first
      let composedTransform = t ?? undefined
      if (t && parentTransform) {
        const groupGeom = applyGrpTransform(
          { x: t.offX, y: t.offY, w: Math.round((t.scaleX > 0 ? 1 : 0)), h: Math.round((t.scaleY > 0 ? 1 : 0)) },
          parentTransform,
        )
        composedTransform = { ...t, offX: groupGeom.x, offY: groupGeom.y, scaleX: t.scaleX * parentTransform.scaleX, scaleY: t.scaleY * parentTransform.scaleY }
      }
      // Render group children as top-level absolutely-positioned elements
      const pseudoTree = child
      const html = await renderSpTree(
        pseudoTree, themeColors, zip, zipBasePath, rels, masterDoc,
        layoutPhs, masterPhs, skipPlaceholders, composedTransform,
      )
      parts.push(html)
    }
  }

  return parts.join('')
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function renderSlideToHtml(
  slideXml: string,
  canvasW: number,      // EMU
  canvasH: number,      // EMU
  background: string | undefined,
  themeColors: ThemeColors,
  zip: JSZip,
  slideZipPath: string,
  slideRels: RelMap,
  layoutDoc: Document | null,
  layoutZipPath: string | null,
  masterDoc: Document | null,
  masterZipPath: string | null,
  layoutPlaceholders: PlaceholderMap,
  masterPlaceholders: PlaceholderMap,
): Promise<string> {
  const cw = canvasW * EMU_PX
  const ch = canvasH * EMU_PX
  const bg = background ? `background-color:${background}` : 'background-color:#ffffff'

  // Load rels for master and layout (needed for their embedded images)
  let masterRels: RelMap = new Map()
  let layoutRels: RelMap = new Map()
  if (masterZipPath) {
    const xml = await loadZipString(zip, relsPathFor(masterZipPath)) ?? ''
    masterRels = parseRelationships(xml)
  }
  if (layoutZipPath) {
    const xml = await loadZipString(zip, relsPathFor(layoutZipPath)) ?? ''
    layoutRels = parseRelationships(xml)
  }

  const parts: string[] = []

  // ── Master decorative shapes (logos, watermarks, background elements)
  if (masterDoc && masterZipPath) {
    const tree = qs(masterDoc, 'spTree')
    if (tree) {
      parts.push(await renderSpTree(
        tree, themeColors, zip, masterZipPath, masterRels,
        masterDoc, new Map(), new Map(), true,
      ))
    }
  }

  // ── Layout decorative shapes
  if (layoutDoc && layoutZipPath) {
    const tree = qs(layoutDoc, 'spTree')
    if (tree) {
      parts.push(await renderSpTree(
        tree, themeColors, zip, layoutZipPath, layoutRels,
        masterDoc, new Map(), new Map(), true,
      ))
    }
  }

  // ── Slide shapes
  let slideDoc: Document
  try { slideDoc = parseXml(slideXml) } catch { slideDoc = parseXml('<root/>') }
  const slideTree = qs(slideDoc, 'spTree')
  if (slideTree) {
    parts.push(await renderSpTree(
      slideTree, themeColors, zip, slideZipPath, slideRels,
      masterDoc, layoutPlaceholders, masterPlaceholders, false,
    ))
  }

  return `<div style="position:relative;width:${cw.toFixed(1)}px;height:${ch.toFixed(1)}px;overflow:hidden;${bg}">${parts.join('')}</div>`
}
