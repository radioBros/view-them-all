export type PdfEmbedBlock = {
  type: 'pdf-embed'
  src: string     // blob: object URL — caller owns revocation
}
