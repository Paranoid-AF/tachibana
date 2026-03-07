import type {
  SideloaderOptions,
  SideloaderResult,
  TwoFactorInfo,
} from '../../types.ts'
import { getDaemon, onDaemonEvent } from '../daemon.ts'

/**
 * Ensure the daemon is authenticated.
 * Handles login + 2FA flow via the daemon IPC protocol.
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

    const daemon = await getDaemon()

    // Check if already logged in
    const info = await daemon.request<{ loggedIn: boolean }>('getSessionInfo')
    if (info.loggedIn) {
      return { success: true, data: undefined }
    }

    // Set up 2FA handler if provided
    let twoFaPromise: Promise<string> | null = null
    let resolve2fa: ((code: string) => void) | null = null
    let daemonSessionId: string | null = null

    if (options.on2FA) {
      const on2FA = options.on2FA
      onDaemonEvent(async (event, data) => {
        if (event === '2fa_required') {
          daemonSessionId = data.sessionId as string
          const info: TwoFactorInfo = {
            type: (data.type as string) === 'sms' ? 'sms' : 'trustedDevice',
            phoneNumbers: data.phoneNumbers as TwoFactorInfo['phoneNumbers'],
          }
          const code = await on2FA(info)
          resolve2fa?.(code)
        }
      })
    }

    // Start login — may trigger 2fa_required event
    const loginPromise = new Promise<void>((resolve, reject) => {
      // If 2FA is needed, the daemon will emit a 2fa_required event
      // and block the login request until we submit the code
      twoFaPromise = new Promise<string>(res => {
        resolve2fa = res
      })

      // Wire up: when 2FA code is collected, submit it
      twoFaPromise.then(async code => {
        try {
          if (!daemonSessionId) {
            throw new Error('No daemon 2FA session ID received')
          }
          await daemon.request('submit2fa', {
            sessionId: daemonSessionId,
            code,
          })
        } catch (err) {
          reject(err)
        }
      })

      daemon
        .request('login', {
          email: options.credentials!.appleAccount,
          password: options.credentials!.password,
        })
        .then(() => resolve())
        .catch(reject)
    })

    await loginPromise
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
