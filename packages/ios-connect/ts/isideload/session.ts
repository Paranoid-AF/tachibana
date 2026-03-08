import type { NativeSession, StoredSession } from './native.ts'
import { getNative } from './native.ts'

interface SessionOptions {
  dataDir?: string
  anisetteUrl?: string
  restoredSession?: StoredSession
}

let _opts: SessionOptions = {}
let _sessionPromise: Promise<NativeSession> | null = null

/** Configure session options. Resets the existing session so next getSession() picks up new opts. */
export function configureSession(opts: SessionOptions): void {
  _opts = opts
  _sessionPromise = null
}

/** Get or create the singleton native Session instance, optionally restoring a persisted session. */
export function getSession(): Promise<NativeSession> {
  if (!_sessionPromise) {
    _sessionPromise = (async () => {
      const { Session } = getNative()
      const session = new Session(_opts.dataDir ?? '.', _opts.anisetteUrl)
      if (_opts.restoredSession) {
        try {
          await session.restoreSession(_opts.restoredSession)
        } catch (err) {
          console.warn('[ios-connect] Failed to restore session, starting fresh:', err)
        }
      }
      return session
    })()
  }
  return _sessionPromise
}
