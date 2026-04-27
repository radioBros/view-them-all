import type { Inline, TextInline, LinkInline, ImageInline, UnknownInline } from '../../core/model/types'
import { sanitizeHref } from '../../shared/url'

export function renderInline(inlines: Inline[]): Node[] {
  return inlines.map(i => {
    try {
      return renderOneInline(i)
    } catch (e) {
      console.error('[ufpe] Inline render error:', e)
      return document.createTextNode('')
    }
  })
}

function renderOneInline(i: Inline): Node {
  switch (i.type) {
    case 'text':          return renderText(i)
    case 'link':          return renderLink(i)
    case 'image-inline':  return renderImageInline(i)
    case 'unknown-inline':return renderUnknownInline(i)
  }
}

export function renderText(i: TextInline): Node {
  const hasFormatting = i.bold || i.italic || i.underline || i.strikethrough || i.code || i.color || i.fontSize || i.fontFamily
  if (!hasFormatting) return document.createTextNode(i.text)

  const span = document.createElement('span')
  span.textContent = i.text

  if (i.bold)          span.classList.add('ufpe-bold')
  if (i.italic)        span.classList.add('ufpe-italic')
  if (i.underline)     span.classList.add('ufpe-underline')
  if (i.strikethrough) span.classList.add('ufpe-strikethrough')
  if (i.code)          span.classList.add('ufpe-inline-code')
  if (i.color) {
    span.style.setProperty('--ufpe-text-color', i.color)
    span.classList.add('ufpe-colored-text')
  }
  if (i.fontSize) span.style.fontSize = `calc(${i.fontSize} / var(--ufpe-canvas-h-pt, 540) * 100cqh)`
  if (i.fontFamily) span.style.fontFamily = i.fontFamily

  return span
}

export function renderLink(i: LinkInline): Node {
  const href = sanitizeHref(i.href)
  if (!href) {
    console.warn('[ufpe] Unsafe href rejected:', i.href)
    return document.createTextNode(i.text)
  }
  const a = document.createElement('a')
  a.href = href
  a.textContent = i.text
  a.rel = 'noopener noreferrer'
  a.target = '_blank'
  a.classList.add('ufpe-link')
  return a
}

export function renderImageInline(i: ImageInline): HTMLImageElement {
  const img = document.createElement('img')
  img.src = i.src
  img.alt = i.alt ?? ''
  img.className = 'ufpe-inline-image'
  if (i.width)  img.width  = i.width
  if (i.height) img.height = i.height
  return img
}

export function renderUnknownInline(_i: UnknownInline): HTMLSpanElement {
  const span = document.createElement('span')
  span.className = 'ufpe-unknown-inline'
  return span
}
