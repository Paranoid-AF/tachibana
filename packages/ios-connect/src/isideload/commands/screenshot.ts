import type { SideloaderResult } from '../../types.ts'
import { getDaemon } from '../daemon.ts'

/** Take a screenshot from a connected device */
export async function screenshot(
  udid: string,
  outputPath: string
): Promise<SideloaderResult<string>> {
  try {
    const daemon = await getDaemon()
    const result = await daemon.request<{ path: string }>('screenshot', {
      udid,
      outputPath,
    })
    return { success: true, data: result.path }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'COMMAND_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}
