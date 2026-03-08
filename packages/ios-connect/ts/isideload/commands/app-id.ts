import type {
  SideloaderOptions,
  SideloaderResult,
  AppIdInfo,
} from '../../types.ts'
import { getSession } from '../session.ts'
import { ensureSession } from './auth.ts'

/** List app IDs */
export async function list(
  options?: SideloaderOptions
): Promise<SideloaderResult<AppIdInfo[]>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const session = getSession()
    const appIds = await session.listAppIds(options?.teamId)
    return { success: true, data: appIds }
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

    const session = getSession()
    const appId = await session.createAppId(bundleId, name, options?.teamId)
    return { success: true, data: appId.identifier }
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
