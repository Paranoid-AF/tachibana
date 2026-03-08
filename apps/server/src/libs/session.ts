import { homedir } from 'os'
import { join } from 'path'
import { mkdir } from 'fs/promises'

import { configureSession, getSession as getNativeSession } from '@tachibana/ios-connect'
import type { NativeSession } from '@tachibana/ios-connect'

function getSessionDataDir(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? homedir()
    return join(appData, 'tachibana', 'sessions')
  }
  return join(homedir(), '.local', 'state', 'tachibana', 'sessions')
}

let _initialized = false

async function ensureInitialized(): Promise<void> {
  if (_initialized) return
  const dataDir = getSessionDataDir()
  await mkdir(dataDir, { recursive: true })
  configureSession({ dataDir })
  _initialized = true
}

export async function getSession(): Promise<NativeSession> {
  await ensureInitialized()
  return getNativeSession()
}
