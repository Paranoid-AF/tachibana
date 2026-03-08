import type { NativeSession } from './native.ts'
import { getNative } from './native.ts'

interface SessionOptions {
  dataDir?: string
  anisetteUrl?: string
}

let _session: NativeSession | null = null
let _opts: SessionOptions = {}

/** Configure session options. Resets the existing session so next getSession() picks up new opts. */
export function configureSession(opts: SessionOptions): void {
  _opts = opts
  _session = null
}

/** Get or create the singleton native Session instance. */
export function getSession(): NativeSession {
  if (_session) return _session
  const native = getNative()
  _session = new native.Session(_opts.dataDir ?? '.', _opts.anisetteUrl)
  return _session
}
