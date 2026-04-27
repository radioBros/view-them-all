import { qs } from '../xml'

/**
 * Parse META-INF/container.xml and return the path to the OPF file.
 * Returns empty string if not found.
 */
export function parseContainer(xml: Document): string {
  const rootfile = qs(xml, 'rootfile')
  return rootfile?.getAttribute('full-path') ?? ''
}
