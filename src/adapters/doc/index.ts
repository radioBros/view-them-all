import type { Adapter, ParseOptions } from '../../core/adapter/Adapter'
import type { Result } from '../../core/model/types'
import { err } from '../../core/model/types'

export const docAdapter: Adapter = {
  name: 'doc',
  extensions: ['doc', 'dot'],
  mimeTypes: ['application/msword', 'application/x-msword'],

  async parse(_file: File | ArrayBuffer, _options?: ParseOptions): Promise<Result<any>> {
    return err({
      code: 'UNSUPPORTED_FORMAT',
      message:
        'Legacy .doc format is not supported. Open in Microsoft Word or LibreOffice Writer and save as .docx, then upload the new file.',
    })
  },
}
