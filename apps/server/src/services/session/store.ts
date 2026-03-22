import type { StoredSession } from '@tbana/ios-connect'

import { getSecret, setSecret, deleteSecret } from '../../libs/secrets.ts'

const SECRET_NAME = 'apple-session'

export async function getSessionData(): Promise<StoredSession | undefined> {
  const raw = await getSecret(SECRET_NAME)
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

export async function saveSessionData(data: StoredSession): Promise<void> {
  await setSecret(SECRET_NAME, JSON.stringify(data))
}

export async function clearSessionData(): Promise<void> {
  await deleteSecret(SECRET_NAME)
}
