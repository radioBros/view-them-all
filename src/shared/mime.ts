export const EXT_TO_MIME: Record<string, string> = {
  // Documents
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf:  'application/pdf',
  // Images
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  gif:  'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp:  'image/bmp',
  ico:  'image/x-icon',
  tiff: 'image/tiff',
  tif:  'image/tiff',
  svg:  'image/svg+xml',
  // Video
  mp4:  'video/mp4',
  webm: 'video/webm',
  mov:  'video/quicktime',
  avi:  'video/x-msvideo',
  // Audio
  mp3:  'audio/mpeg',
  wav:  'audio/wav',
  ogg:  'audio/ogg',
  flac: 'audio/flac',
  aac:  'audio/aac',
  // Archive
  zip:  'application/zip',
  // Text
  txt:  'text/plain',
  md:   'text/markdown',
  json: 'application/json',
  xml:  'application/xml',
  html: 'text/html',
  htm:  'text/html',
  css:  'text/css',
  js:   'text/javascript',
  ts:   'application/typescript',
}

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_MIME[ext] ?? 'application/octet-stream'
}

export function getExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}
