import type {
  SideloaderOptions,
  SideloaderResult,
  AppIdInfo,
} from '../../types.ts'
import { getDaemon } from '../daemon.ts'
import { ensureSession } from './auth.ts'

/** List app IDs */
export async function list(
  options?: SideloaderOptions
): Promise<SideloaderResult<AppIdInfo[]>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const daemon = await getDaemon()
    const result = await daemon.request<{ appIds: AppIdInfo[] }>(
      'listAppIds',
      {}
    )
    return { success: true, data: result.appIds }
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

/** Register an app ID */
export async function register(
  bundleId: string,
  name: string,
  options?: SideloaderOptions
): Promise<SideloaderResult<string>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const daemon = await getDaemon()
    const result = await daemon.request<{ appId: string }>('createAppId', {
      bundleId,
      name,
    })
    return { success: true, data: result.appId }
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
