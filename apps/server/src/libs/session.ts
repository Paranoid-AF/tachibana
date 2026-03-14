import { mkdir } from 'fs/promises'

import {
  configureSession,
  getSession as getNativeSession,
} from '@tbana/ios-connect'
import type { NativeSession } from '@tbana/ios-connect'

import { getConfigDir } from './config.ts'
import {
  getSessionData,
  saveSessionData,
  clearSessionData,
} from './session-store.ts'

let _initPromise: Promise<void> | null = null

function ensureInitialized(): Promise<void> {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    const dataDir = getConfigDir()
    await mkdir(dataDir, { recursive: true })

    const restoredSession = await getSessionData()

    configureSession({ dataDir, restoredSession })

    if (restoredSession) {
      const session = await getNativeSession()
      const data = await session.getSessionData()
      if (!data) {
        console.warn(
          '[ios-connect] Session restore failed, clearing saved session'
        )
        await clearSessionData()
      }
    }
  })()
  return _initPromise
}

export async function getSession(): Promise<NativeSession> {
  await ensureInitialized()
  return await getNativeSession()
}

export async function saveSession(session: NativeSession): Promise<void> {
  try {
    const data = await session.getSessionData()
    if (data) {
      await saveSessionData(data)
    } else {
      console.warn(
        '[session] getSessionData() returned null, session will not be persisted'
      )
    }
  } catch (err) {
    console.error('[session] saveSession failed:', err)
  }
}

export async function clearSession(): Promise<void> {
  await clearSessionData()
  _initPromise = null
}
