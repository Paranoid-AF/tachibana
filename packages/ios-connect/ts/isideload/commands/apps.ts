import type { SideloaderResult } from '../../types.ts'
import { getNative } from '../native.ts'
import type { InstalledAppInfo } from '../native.ts'

export type { InstalledAppInfo }

/** List installed apps on a USB-connected device (no auth required). */
export async function listInstalledApps(
  udid: string,
  appType?: string
): Promise<SideloaderResult<InstalledAppInfo[]>> {
  try {
    const apps = await getNative().listInstalledApps(udid, appType ?? null)
    return { success: true, data: apps }
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
