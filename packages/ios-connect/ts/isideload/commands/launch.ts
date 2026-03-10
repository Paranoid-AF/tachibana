import type { SideloaderResult } from '../../types.ts'
import { getNative } from '../native.ts'

/** Launch an app on a connected device. Returns the PID of the launched process. */
export async function launchApp(
  udid: string,
  bundleId: string,
  env?: Record<string, string>
): Promise<SideloaderResult<number>> {
  try {
    const pid =
      env && Object.keys(env).length > 0
        ? await getNative().launchAppWithEnv(udid, bundleId, env)
        : await getNative().launchApp(udid, bundleId)
    return { success: true, data: pid }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'LAUNCH_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}
