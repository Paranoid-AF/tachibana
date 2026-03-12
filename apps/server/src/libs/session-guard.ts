import type { NativeSession } from '@tbana/ios-connect'

import { getSession, saveSession, clearSession } from './session.ts'
import { getCredentials, clearCredentials } from './credentials.ts'

let reloginInProgress: Promise<NativeSession> | null = null

function isSessionExpiredError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return /your session has expired/i.test(error.message)
}

export async function withSessionRetry<T>(
  fn: (session: NativeSession) => Promise<T>
): Promise<T> {
  const session = await getSession()

  try {
    return await fn(session)
  } catch (error) {
    if (!isSessionExpiredError(error)) throw error

    console.warn('[session-guard] Session expired, attempting recovery...')

    // Prevent concurrent re-login attempts
    if (!reloginInProgress) {
      reloginInProgress = attemptRelogin()
      reloginInProgress.finally(() => {
        reloginInProgress = null
      })
    }

    const freshSession = await reloginInProgress
    return await fn(freshSession)
  }
}

async function attemptRelogin(): Promise<NativeSession> {
  const creds = await getCredentials()

  if (!creds) {
    console.warn(
      '[session-guard] No saved credentials — signing out automatically'
    )
    await clearSession()
    throw new Error('Session expired and no saved credentials available')
  }

  await clearSession()
  const freshSession = await getSession()

  try {
    await Promise.race([
      freshSession.login(creds.email, creds.password, () => {
        // 2FA requested — cannot auto-login
        throw new Error('Session expired and 2FA is required to re-login')
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Auto re-login timed out')),
          30_000
        )
      ),
    ])

    await saveSession(freshSession)
    console.log('[session-guard] Auto re-login successful')
    return freshSession
  } catch (err) {
    console.error('[session-guard] Auto re-login failed:', err)
    await clearCredentials()
    await clearSession()
    throw err
  }
}
