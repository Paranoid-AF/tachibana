import type { SideloaderOptions, SideloaderResult } from '../../types.ts'
import { getSession } from '../session.ts'
import { ensureSession } from './auth.ts'

/**
 * Install an IPA on a device.
 * Handles the full pipeline: auth + sign + install via native addon.
 */
export async function install(
  ipaPath: string,
  options?: SideloaderOptions
): Promise<SideloaderResult<string>> {
  try {
    if (!options?.udid) {
      return {
        success: false,
        error: { code: 'NO_UDID', message: 'No device UDID provided' },
      }
    }

    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const session = getSession()
    await session.installApp(ipaPath, options.udid, options.teamId)

    return { success: true, data: 'Installation complete' }
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

/** Sign an IPA without installing */
export async function sign(
  ipaPath: string,
  options?: SideloaderOptions
): Promise<SideloaderResult<string>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const session = getSession()
    const signedPath = await session.signApp(ipaPath, options?.teamId)

    return { success: true, data: signedPath }
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
