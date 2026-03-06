import type { SideloaderOptions, SideloaderResult } from '../../types.ts'
import { getDaemon } from '../daemon.ts'
import { ensureSession } from './auth.ts'

/**
 * Install an IPA on a device.
 * Handles the full pipeline: auth + sign + install via kani-isideload daemon.
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

    const daemon = await getDaemon()
    await daemon.request(
      'installApp',
      { appPath: ipaPath, udid: options.udid },
      120_000 // 2 minute timeout for sign + install
    )

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

    const daemon = await getDaemon()
    const result = await daemon.request<{ signedPath: string }>(
      'signApp',
      { appPath: ipaPath },
      120_000
    )

    return { success: true, data: result.signedPath }
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
