import type { SideloaderResult } from '../../types.ts'
import { getNative } from '../native.ts'

/** Take a screenshot from a connected device */
export async function screenshot(
  udid: string,
  outputPath: string
): Promise<SideloaderResult<string>> {
  try {
    const native = getNative()
    const path = await native.screenshot(udid, outputPath)
    return { success: true, data: path }
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
