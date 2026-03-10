import type {
  SideloaderOptions,
  SideloaderResult,
  TwoFactorInfo,
} from '../../types.ts'
import { getSession } from '../session.ts'

/**
 * Ensure the session is authenticated.
 * Handles login + 2FA flow via the native addon Session.
 */
export async function ensureSession(
  options?: SideloaderOptions
): Promise<SideloaderResult<void>> {
  try {
    if (!options?.credentials) {
      return {
        success: false,
        error: { code: 'NO_CREDENTIALS', message: 'No credentials provided' },
      }
    }

    const session = await getSession()

    const info = await session.getSessionInfo()
    if (info.loggedIn) {
      return { success: true, data: undefined }
    }

    const on2FA = options.on2FA

    // The 2FA callback is passed directly to Rust as a JS async function.
    // Rust calls it from within the isideload 2FA closure and awaits the returned Promise.
    const twoFaCallback = async (info: { type: string }): Promise<string> => {
      if (!on2FA) {
        throw new Error('2FA required but no on2FA callback provided')
      }
      const tfInfo: TwoFactorInfo = {
        type: info.type === 'sms' ? 'sms' : 'trustedDevice',
      }
      return on2FA(tfInfo)
    }

    await session.login(
      options.credentials.appleAccount,
      options.credentials.password,
      twoFaCallback
    )

    return { success: true, data: undefined }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'AUTH_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}
