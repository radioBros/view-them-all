import JSZip from 'jszip'
import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Block, Result } from '../../core/model/types'
import { ok, err } from '../../core/model/types'
import { normalizeMeta } from '../../core/model/meta'
import { parseWorkbook } from './parser/workbook'
import { parseSharedStrings } from './parser/shared-strings'
import { parseStyles } from './parser/styles'
import { buildTableBlockFromXml } from './parser/sheet'

const MAX_ROWS = 5000

export const xlsxAdapter: Adapter = {
  name: 'xlsx',
  extensions: ['xlsx', 'xlsm'],
  mimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroenabled.12',
  ],

  async parse(file: File | ArrayBuffer, options?: ParseOptions): Promise<Result<any>> {
    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted before start' })

    const buffer = file instanceof File ? await file.arrayBuffer() : file

    if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after read' })

    try {
      const zip = await JSZip.loadAsync(buffer)

      if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted after unzip' })

      const wbXml   = await zip.file('xl/workbook.xml')?.async('string') ?? ''
      const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string') ?? ''
      const { sheets, is1904 } = parseWorkbook(wbXml, relsXml)

      const ssText = await zip.file('xl/sharedStrings.xml')?.async('string') ?? ''
      const sharedStrings = ssText ? parseSharedStrings(ssText) : []

      const stylesText = await zip.file('xl/styles.xml')?.async('string') ?? ''
      const getStyle = stylesText ? parseStyles(stylesText) : () => ({ isDate: false })

      const sheetsToProcess = (options as any)?.sheetIndex !== undefined
        ? [sheets[(options as any).sheetIndex] ?? sheets[0]]
        : sheets

      const sheetNames = sheets.map(s => s.name)
      const blocks: Block[] = []

      for (const sheet of sheetsToProcess) {
        if (!sheet) continue
        if (options?.signal?.aborted) return err({ code: 'ABORTED', message: 'Aborted during sheet parse' })

        const sheetXml = await zip.file(sheet.path)?.async('string') ?? ''
        const { block, totalRows } = buildTableBlockFromXml(
          sheetXml,
          sheetsToProcess.length === 1 ? undefined : sheet.name,
          sharedStrings,
          getStyle,
          is1904,
          MAX_ROWS,
        )

        if (sheetsToProcess.length > 1) {
          blocks.push({ type: 'heading', level: 2, content: [{ type: 'text', text: sheet.name }] })
        }

        blocks.push(block)

        if (totalRows > MAX_ROWS) {
          blocks.push({
            type: 'unknown',
            raw: `Sheet truncated: showing first ${MAX_ROWS} of ${totalRows} rows.`,
          })
        }
      }

      return ok({ blocks, meta: normalizeMeta({ sheetNames }) })
    } catch (e) {
      return err({ code: 'CORRUPT_FILE', message: String(e), source: e })
    }
  },
}
