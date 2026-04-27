import type { Adapter } from '../../core/adapter/Adapter'
import { err } from '../../core/model/types'

export const xlsbAdapter: Adapter = {
  name: 'xlsb',
  extensions: ['xlsb'],
  mimeTypes: ['application/vnd.ms-excel.sheet.binary.macroenabled.12'],
  async parse(_file, _options) {
    return err({
      code: 'UNSUPPORTED_FORMAT',
      message: 'Binary .xlsb format is not supported. Open in Microsoft Excel or LibreOffice Calc and save as .xlsx, then upload the new file.',
    })
  },
}
