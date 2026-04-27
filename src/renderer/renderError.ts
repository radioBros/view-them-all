import type { ParseError } from '../core/model/types'

export function renderError(error: ParseError, container: HTMLElement): void {
  container.innerHTML = ''
  const div = document.createElement('div')
  div.className = 'ufpe-error'
  div.setAttribute('role', 'alert')

  const icon = document.createElement('span')
  icon.className = 'ufpe-error-icon'
  icon.textContent = '⚠'
  icon.setAttribute('aria-hidden', 'true')

  const msg = document.createElement('p')
  msg.className = 'ufpe-error-message'
  msg.textContent = friendlyMessage(error.code)

  const code = document.createElement('p')
  code.className = 'ufpe-error-code'
  code.textContent = error.code

  div.appendChild(icon)
  div.appendChild(msg)
  div.appendChild(code)
  container.appendChild(div)
}

function friendlyMessage(code: ParseError['code']): string {
  switch (code) {
    case 'UNSUPPORTED_FORMAT': return 'This file type is not supported.'
    case 'CORRUPT_FILE':       return 'The file appears to be corrupted.'
    case 'FILE_TOO_LARGE':     return 'This file is too large to preview.'
    case 'ABORTED':            return 'Preview was cancelled.'
    case 'PARSE_FAILED':       return 'Failed to parse the file.'
    default:                   return 'Preview is unavailable.'
  }
}
