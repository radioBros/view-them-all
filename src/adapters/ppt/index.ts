import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Result } from '../../core/model/types'
import { err } from '../../core/model/types'

export const pptAdapter: Adapter = {
  name: 'ppt',
  extensions: ['ppt', 'pot', 'pps'],
  mimeTypes: [
    'application/vnd.ms-powerpoint',
    'application/x-mspowerpoint',
  ],

  async parse(_file: File | ArrayBuffer, _options?: ParseOptions): Promise<Result<any>> {
    return err({
      code: 'UNSUPPORTED_FORMAT',
      message:
        'Legacy .ppt format is not supported. Open in Microsoft PowerPoint or LibreOffice Impress and save as .pptx, then upload the new file.',
    })
  },
}
