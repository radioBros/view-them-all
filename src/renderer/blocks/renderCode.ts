import type { CodeBlock } from '../../core/model/types'

declare const Prism: { highlightElement(el: Element): void } | undefined

export function renderCode(block: CodeBlock): HTMLElement {
  const pre = document.createElement('pre')
  pre.className = 'ufpe-code-block'

  const code = document.createElement('code')
  if (block.language) {
    code.className = `language-${block.language}`
    code.setAttribute('data-language', block.language)
  }
  code.textContent = block.code

  if (typeof Prism !== 'undefined' && block.language) {
    Prism.highlightElement(code)
  }

  pre.appendChild(code)
  return pre
}
