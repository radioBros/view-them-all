# ViewThemAll

**Preview any file. One library.**

A framework-agnostic TypeScript library that normalizes every common file format into a unified `DocumentModel`, then renders it with a single engine. Drop in a DOCX, PDF, spreadsheet, presentation, ebook, image, video, or ZIP — and get a consistent DOM preview with zero server round-trips.

```ts
import { registerAdapter, engine } from 'viewthemall'
import { docxAdapter } from 'viewthemall/adapters/docx'
import { xlsxAdapter } from 'viewthemall/adapters/xlsx'
import { pdfAdapter }  from 'viewthemall/adapters/pdf'

registerAdapter(docxAdapter)
registerAdapter(xlsxAdapter)
registerAdapter(pdfAdapter)

await engine.preview(file, document.getElementById('preview')!)
```

---

## Why ViewThemAll?

| Library | Problem |
|---------|---------|
| Mammoth.js | HTML output only — no structured model, fragile output |
| SheetJS | Raw data, no type detection, no render layer |
| Prism.js | Code only, no integration with document formats |

**ViewThemAll** normalises ALL formats into one `DocumentModel` and renders with one engine. Adapters know nothing about the DOM. The renderer knows nothing about file formats. Errors are values — no exceptions cross module boundaries.

---

## Supported Formats — 19 Adapters

| Adapter | Extensions | Notes |
|---------|-----------|-------|
| DOCX | `.docx` | Full OOXML → DocumentModel. Tables, nested lists, images, hyperlinks, paragraph styles, bold/italic/colour/code spans. No HTML intermediate. |
| XLSX | `.xlsx`, `.xlsm` | Hand-written OOXML + JSZip parser. Merged cells, header detection, multi-sheet, all cell types including dates. No ExcelJS, no SheetJS. |
| PPTX | `.pptx`, `.ppsx` | Full OOXML slide parsing. Positioned text, images, speaker notes, canvas dimensions. |
| PDF | `.pdf` | Native browser iframe rendering. No dependencies. Chrome, Edge, Firefox and Safari all render PDFs natively. |
| CSV / TSV | `.csv`, `.tsv` | RFC 4180 compliant. Auto-detects delimiter, quoted fields, headers. Up to 5 000 rows. |
| Markdown | `.md`, `.mdx`, `.markdown` | CommonMark subset — headings, bold/italic, links, images, fenced code, GFM tables. |
| RTF | `.rtf`, `.rtx` | Text extraction. Unicode escape support. No external dependency. |
| ODT | `.odt`, `.ott` | LibreOffice Writer. Paragraphs, headings, lists, tables, images. ZIP + XML, no external dep. |
| ODS | `.ods`, `.ots` | LibreOffice Calc. All cell types, multi-sheet, colspan, row repeat. No external dep. |
| ODP | `.odp`, `.otp` | LibreOffice Impress. Slides with positioned text and images. ODF length unit conversion. |
| EPUB | `.epub` | EPUB 2 + 3. OPF spine reading order, full HTML → DocumentModel, embedded image blobs. Up to 50 chapters. |
| Text & Code | `.txt`, `.js`, `.ts`, `.py`, `.json`, `.log`, 30+ more | Prism.js syntax highlighting. Large-file truncation. |
| Image | `.png`, `.jpg`, `.gif`, `.webp`, `.svg` | Inline object-URL rendering. SVG sanitized against XSS. |
| Audio & Video | `.mp4`, `.webm`, `.ogg`, `.mp3`, `.wav` | Native browser controls. MediaType detection. |
| Archive | `.zip` | File tree with recursive previews. Path traversal guards, 10 000 entry limit, zip-bomb defence. |
| XLS (legacy) | `.xls`, `.xlt` | Returns clear conversion message → re-save as `.xlsx`. |
| XLSB (binary) | `.xlsb` | Returns clear conversion message → re-save as `.xlsx`. |
| DOC (legacy) | `.doc`, `.dot` | Returns clear conversion message → re-save as `.docx`. |
| PPT (legacy) | `.ppt`, `.pot`, `.pps` | Returns clear conversion message → re-save as `.pptx`. |

---

## Installation

```sh
npm install viewthemall jszip prismjs
```

**Peer dependencies** — install only the ones you actually use:

| Adapters | Dependency |
|----------|-----------|
| DOCX, XLSX, PPTX, ODT, ODS, ODP, EPUB, Archive | `jszip` |
| Text & Code | `prismjs` |
| PDF, CSV, RTF, MD, Image, Media, XLS, XLSB, DOC, PPT | _(none)_ |

Tree-shaking works at the adapter level — import only what you use and the rest is never bundled.

---

## Quick Start

### Register adapters

Register once at app startup, before any files are loaded.

```ts
import { registerAdapter } from 'viewthemall'
import { docxAdapter }     from 'viewthemall/adapters/docx'
import { xlsxAdapter }     from 'viewthemall/adapters/xlsx'
import { pptxAdapter }     from 'viewthemall/adapters/pptx'
import { pdfAdapter }      from 'viewthemall/adapters/pdf'
import { csvAdapter }      from 'viewthemall/adapters/csv'
import { textCodeAdapter } from 'viewthemall/adapters/text-code'
import { mdAdapter }       from 'viewthemall/adapters/md'
import { rtfAdapter }      from 'viewthemall/adapters/rtf'
import { odtAdapter }      from 'viewthemall/adapters/odt'
import { odsAdapter }      from 'viewthemall/adapters/ods'
import { odpAdapter }      from 'viewthemall/adapters/odp'
import { epubAdapter }     from 'viewthemall/adapters/epub'
import { imageAdapter }    from 'viewthemall/adapters/image'
import { mediaAdapter }    from 'viewthemall/adapters/media'
import { archiveAdapter }  from 'viewthemall/adapters/archive'
import { xlsAdapter }      from 'viewthemall/adapters/xls'
import { xlsbAdapter }     from 'viewthemall/adapters/xlsb'
import { docAdapter }      from 'viewthemall/adapters/doc'
import { pptAdapter }      from 'viewthemall/adapters/ppt'

registerAdapter(docxAdapter)
registerAdapter(xlsxAdapter)
registerAdapter(pptxAdapter)
registerAdapter(pdfAdapter)
registerAdapter(csvAdapter)
registerAdapter(textCodeAdapter)
registerAdapter(mdAdapter)       // register after text-code — overrides .md/.mdx
registerAdapter(rtfAdapter)
registerAdapter(odtAdapter)
registerAdapter(odsAdapter)
registerAdapter(odpAdapter)
registerAdapter(epubAdapter)
registerAdapter(imageAdapter)
registerAdapter(mediaAdapter)
registerAdapter(archiveAdapter)
registerAdapter(xlsAdapter)
registerAdapter(xlsbAdapter)
registerAdapter(docAdapter)
registerAdapter(pptAdapter)
```

### Preview a file

```ts
import { engine } from 'viewthemall'

const container = document.getElementById('preview')!

// File from <input type="file"> or drag-and-drop
await engine.preview(file, container)
```

### With abort support

```ts
let controller: AbortController | null = null

async function loadFile(file: File, container: HTMLElement) {
  controller?.abort()
  controller = new AbortController()
  await engine.preview(file, container, { signal: controller.signal })
}
```

### React

```tsx
import { useEffect, useRef } from 'react'
import { engine } from 'viewthemall'

export function FilePreview({ file }: { file: File | null }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!file || !ref.current) return
    const ctrl = new AbortController()
    engine.preview(file, ref.current, { signal: ctrl.signal })
    return () => ctrl.abort()
  }, [file])

  return <div ref={ref} />
}
```

### Vue

```vue
<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { engine, unmount } from 'viewthemall'

const props = defineProps<{ file: File | null }>()
const container = ref<HTMLElement | null>(null)
let ctrl: AbortController | null = null

watch(() => props.file, async (file) => {
  if (!container.value) return
  ctrl?.abort()
  unmount(container.value)
  if (!file) return
  ctrl = new AbortController()
  await engine.preview(file, container.value, { signal: ctrl.signal })
})
onUnmounted(() => ctrl?.abort())
</script>

<template><div ref="container" /></template>
```

---

## Architecture

```
File (any format)
   │
   ▼
AdapterRegistry.resolve(file)  →  Adapter
   │
   ▼
adapter.parse(file, { signal })  →  Result<DocumentModel>
   │
   ├── ok: true   →  render(model, container)      →  DOM
   └── ok: false  →  renderError(error, container) →  error UI
```

**Adapters** know nothing about the DOM. The **renderer** knows nothing about file formats. The **engine** coordinates. **Errors are values** — `Result<T>` is either `{ ok: true; value: T }` or `{ ok: false; error: ParseError }`. No exceptions cross module boundaries.

All ZIP-based adapters (DOCX, XLSX, PPTX, ODT, ODS, ODP, EPUB, Archive) use the same pattern: JSZip to unzip, then a custom `DOMParser` + `getElementsByTagNameNS('*', localname)` for namespace-agnostic XML parsing. No external XML parsers, no OOXML SDK.

---

## API Reference

### `registerAdapter(adapter)`

Register an adapter with the global registry. Last registration wins — use this to override built-in adapters or register `mdAdapter` after `textCodeAdapter` to take priority for `.md` files.

```ts
import { registerAdapter } from 'viewthemall'
registerAdapter(myCustomAdapter)
```

### `engine.preview(file, container, options?)`

Parse the file and render the result into `container`. Replaces any existing content. Returns a promise that resolves when rendering is complete.

```ts
await engine.preview(file, container, { signal: abortController.signal })
```

### `unmount(container)`

Clean up any resources attached to a container (object URLs, event listeners, PDF.js workers).

```ts
import { unmount } from 'viewthemall'
unmount(container)
```

### `Result<T>`

All `parse` calls return `Result<DocumentModel>`:

```ts
type Result<T> =
  | { ok: true;  value: T }
  | { ok: false; error: ParseError }

type ParseError = {
  code:    'CORRUPT_FILE' | 'UNSUPPORTED_FORMAT' | 'ABORTED' | string
  message: string
  source?: unknown
}
```

### `DocumentModel`

```ts
interface DocumentModel {
  blocks: Block[]
  meta?:  DocumentMeta
}

interface DocumentMeta {
  title?:      string
  author?:     string
  pageCount?:  number
  slideCount?: number
  sheetNames?: string[]
}

type Block =
  | ParagraphBlock | HeadingBlock | ListBlock
  | TableBlock     | ImageBlock   | CodeBlock
  | SlideBlock     | HrBlock      | UnknownBlock
```

---

## Custom Adapters

An adapter is a plain object — implement the `Adapter` interface in ~10 lines:

```ts
import type { Adapter } from 'viewthemall'
import { ok, err } from 'viewthemall'

const myAdapter: Adapter = {
  name: 'my-format',
  extensions: ['myext'],
  mimeTypes: ['application/x-my-format'],

  async parse(file, options) {
    if (options?.signal?.aborted)
      return err({ code: 'ABORTED', message: 'Aborted' })
    try {
      const text = await file.text()
      return ok({
        blocks: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })
    } catch (e) {
      return err({ code: 'CORRUPT_FILE', message: String(e) })
    }
  },
}

registerAdapter(myAdapter)
```

---

## Bundler Setup

### Vite

```ts
// vite.config.ts
export default {
  optimizeDeps: {
    include: ['jszip'],
  },
}
```

### Next.js / SSR

ViewThemAll uses browser APIs. Use dynamic import inside `useEffect` or your framework's `{ ssr: false }` equivalent:

```ts
const { registerAdapter } = await import('viewthemall')
const { docxAdapter }     = await import('viewthemall/adapters/docx')
registerAdapter(docxAdapter)
```

---

## License

MIT © RadioBros
