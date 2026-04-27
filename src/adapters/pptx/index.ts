import JSZip from 'jszip'
import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { normalizeMeta } from '../../core/model/meta'
import { parseXml } from './xml'
import { parsePresentation } from './parser/presentation'
import { parseRelationships } from './parser/relationships'
import { parseSlide } from './parser/slide'
import { parseThemeColors } from './parser/theme'
import type { ThemeColors } from './parser/theme'
import { parseLayoutPlaceholders } from './parser/layout'
import type { PlaceholderMap } from './parser/layout'
import { resolvePath } from './utils'
import { renderSlideToHtml } from './renderer/slideToHtml'

export const pptxAdapter: Adapter = {
  name: 'pptx',
  extensions: ['pptx', 'ppsx'],
  mimeTypes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted before start' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    try {
      const zip = await JSZip.loadAsync(buffer)

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after unzip' })

      // Read the presentation entry point
      const presXmlText = await readZipFile(zip, 'ppt/presentation.xml')
      if (!presXmlText) {
        return err({ code: 'CORRUPT_FILE', message: 'ppt/presentation.xml not found' })
      }

      const presRelsText = await readZipFile(zip, 'ppt/_rels/presentation.xml.rels') ?? ''

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after presentation read' })

      // Parse presentation info: canvas size + slide rIds
      const { canvasWidth, canvasHeight, slideRIds } = parsePresentation(presXmlText)

      // Parse presentation relationships: rId → slide target path
      const presRelMap = parseRelationships(presRelsText)

      // Caches to avoid re-parsing layout/master/theme XMLs across slides
      const xmlCache:               Map<string, string | null> = new Map()
      const layoutPlaceholderCache: Map<string, PlaceholderMap> = new Map()
      const themeColorCache:        Map<string, ThemeColors>    = new Map()
      const parsedDocCache:         Map<string, Document | null> = new Map()

      const getXml = async (path: string): Promise<string | null> => {
        if (xmlCache.has(path)) return xmlCache.get(path)!
        const xml = await readZipFile(zip, path)
        xmlCache.set(path, xml)
        return xml
      }
      const getDoc = async (path: string): Promise<Document | null> => {
        if (parsedDocCache.has(path)) return parsedDocCache.get(path) ?? null
        const xml = await getXml(path)
        if (!xml) { parsedDocCache.set(path, null); return null }
        const doc = parseXml(xml)
        parsedDocCache.set(path, doc)
        return doc
      }

      // Process each slide
      const slideBlocks = []
      for (let i = 0; i < slideRIds.length; i++) {
        if (options?.signal?.aborted) return err({ code: 'ABORTED', message: `Aborted before slide ${i}` })

        const rId = slideRIds[i]!
        const rel = presRelMap.get(rId)
        if (!rel) continue

        const slideZipPath  = `ppt/${rel.target}`
        const slideXml      = await readZipFile(zip, slideZipPath)
        if (!slideXml) continue

        const slideDir      = slideZipPath.substring(0, slideZipPath.lastIndexOf('/'))
        const slideFile     = slideZipPath.substring(slideZipPath.lastIndexOf('/') + 1)
        const slideRelsPath = `${slideDir}/_rels/${slideFile}.rels`
        const slideRelsXml  = await readZipFile(zip, slideRelsPath) ?? ''
        const slideRelMap   = parseRelationships(slideRelsXml)

        // Notes
        const notesRel = [...slideRelMap.values()].find(r => r.type.includes('notesSlide'))
        let notesXml: string | null = null
        if (notesRel) {
          const notesZipPath = resolvePath(slideZipPath, notesRel.target)
          notesXml = await readZipFile(zip, notesZipPath)
        }

        // Layout → Master → Theme chain
        let layoutDoc:          Document | null = null
        let masterDoc:          Document | null = null
        let themeColors:        ThemeColors     = new Map()
        let layoutPlaceholders: PlaceholderMap  = new Map()
        let masterPlaceholders: PlaceholderMap  = new Map()
        let layoutZipPath:      string | null   = null
        let masterZipPath:      string | null   = null

        const layoutRel = [...slideRelMap.values()].find(r => r.type.includes('slideLayout'))
        if (layoutRel) {
          layoutZipPath = resolvePath(slideZipPath, layoutRel.target)
          layoutDoc = await getDoc(layoutZipPath)

          if (!layoutPlaceholderCache.has(layoutZipPath)) {
            const lxml = await getXml(layoutZipPath)
            layoutPlaceholderCache.set(layoutZipPath, lxml ? parseLayoutPlaceholders(lxml) : new Map())
          }
          layoutPlaceholders = layoutPlaceholderCache.get(layoutZipPath)!

          // Master via layout's rels
          const layoutRelsPath = relsPathFor(layoutZipPath)
          const layoutRelsXml  = await getXml(layoutRelsPath) ?? ''
          const layoutRelMap   = parseRelationships(layoutRelsXml)

          const masterRel = [...layoutRelMap.values()].find(r => r.type.includes('slideMaster'))
          if (masterRel) {
            masterZipPath = resolvePath(layoutZipPath, masterRel.target)
            masterDoc = await getDoc(masterZipPath)

            // Master placeholders
            if (!layoutPlaceholderCache.has(masterZipPath)) {
              const mxml = await getXml(masterZipPath)
              layoutPlaceholderCache.set(masterZipPath, mxml ? parseLayoutPlaceholders(mxml) : new Map())
            }
            masterPlaceholders = layoutPlaceholderCache.get(masterZipPath)!

            // Theme via master's rels
            const masterRelsPath = relsPathFor(masterZipPath)
            const masterRelsXml  = await getXml(masterRelsPath) ?? ''
            const masterRelMap   = parseRelationships(masterRelsXml)

            const themeRel = [...masterRelMap.values()].find(r => r.type.includes('/theme'))
            if (themeRel) {
              const themePath = resolvePath(masterZipPath, themeRel.target)
              if (!themeColorCache.has(themePath)) {
                const txml = await getXml(themePath)
                themeColorCache.set(themePath, txml ? parseThemeColors(txml) : new Map())
              }
              themeColors = themeColorCache.get(themePath)!
            }
          }
        }

        const block = await parseSlide(
          slideXml,
          slideRelsXml,
          notesXml,
          i,
          canvasWidth,
          canvasHeight,
          zip,
          layoutDoc,
          masterDoc,
          themeColors,
          layoutPlaceholders,
          masterPlaceholders,
          slideZipPath,
        )

        // High-fidelity HTML render (in-house, no external deps)
        try {
          block.rawHtml = await renderSlideToHtml(
            slideXml,
            canvasWidth,
            canvasHeight,
            block.background,
            themeColors,
            zip,
            slideZipPath,
            slideRelMap,
            layoutDoc,
            layoutZipPath,
            masterDoc,
            masterZipPath,
            layoutPlaceholders,
            masterPlaceholders,
          )
        } catch {
          // rawHtml stays undefined — element-based rendering used as fallback
        }

        slideBlocks.push(block)
      }

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after slides' })

      const coreXml = await readZipFile(zip, 'docProps/core.xml') ?? ''
      const meta = normalizeMeta({
        ...extractCoreMeta(coreXml),
        slideCount: slideBlocks.length,
      })

      return ok({ blocks: slideBlocks, meta })
    } catch (e) {
      return err({ code: 'CORRUPT_FILE', message: String(e), source: e })
    }
  },
}

async function readZipFile(zip: JSZip, path: string): Promise<string | null> {
  try {
    const file = zip.file(path)
    if (!file) return null
    return await file.async('string')
  } catch {
    return null
  }
}

/**
 * Resolve `relative` against `base` (both are full zip paths like "ppt/slides/slide1.xml").
 * Handles "../", "./", and absolute "/" prefixes.
 */
function relsPathFor(zipPath: string): string {
  const dir  = zipPath.substring(0, zipPath.lastIndexOf('/'))
  const file = zipPath.substring(zipPath.lastIndexOf('/') + 1)
  return `${dir}/_rels/${file}.rels`
}


function extractCoreMeta(coreXml: string): Record<string, unknown> {
  if (!coreXml) return {}
  try {
    const doc      = parseXml(coreXml)
    const title    = doc.querySelector('title')?.textContent
    const creator  = doc.querySelector('creator')?.textContent
    const created  = doc.querySelector('created')?.textContent
    const modified = doc.querySelector('modified')?.textContent
    const subject  = doc.querySelector('subject')?.textContent
    const keywords = doc.querySelector('keywords')?.textContent

    return {
      title,
      author:   creator,
      created:  created  ? new Date(created)  : undefined,
      modified: modified ? new Date(modified) : undefined,
      subject,
      keywords: keywords ? keywords.split(',').map(k => k.trim()).filter(Boolean) : undefined,
    }
  } catch {
    return {}
  }
}
