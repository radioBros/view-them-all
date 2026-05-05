export type PdfViewerConfig = {
  page?:      number
  zoom?:      number | string
  search?:    string
  navpanes?:  boolean
  toolbar?:   boolean
  scrollbar?: boolean
  pagemode?:  'bookmarks' | 'thumbs' | 'none'
}

export type PdfEmbedBlock = {
  type:          'pdf-embed'
  src:           string            // blob: object URL — caller owns revocation
  viewerConfig?: PdfViewerConfig
}
