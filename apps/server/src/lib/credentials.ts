import { getSecret, setSecret, deleteSecret } from './secrets.ts'
import { CREDENTIALS_SECRET_NAME as SECRET_NAME } from '../const/auth.ts'

export async function saveCredentials(
  email: string,
  password: string
): Promise<void> {
  await setSecret(SECRET_NAME, JSON.stringify({ email, password }))
}

export async function getCredentials(): Promise<{
  email: string
  password: string
} | null> {
  const raw = await getSecret(SECRET_NAME)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function clearCredentials(): Promise<void> {
  await deleteSecret(SECRET_NAME)
}
