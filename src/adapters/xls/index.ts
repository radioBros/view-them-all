import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Result } from '../../core/model/types'
import { err } from '../../core/model/types'

export const xlsAdapter: Adapter = {
  name: 'xls',
  extensions: ['xls', 'xlt'],
  mimeTypes: ['application/vnd.ms-excel', 'application/x-msexcel'],

  async parse(_file: File | ArrayBuffer, _options?: ParseOptions): Promise<Result<any>> {
    return err({
      code: 'UNSUPPORTED_FORMAT',
      message:
        'Legacy .xls format is not supported. Open in Microsoft Excel or LibreOffice Calc and save as .xlsx, then upload the new file.',
    })
  },
}
