import { join } from 'path'
import { mkdir, unlink } from 'fs/promises'

import { getConfigDir } from './config.ts'

const SERVICE = 'tachibana'

// Bun.secrets is available at runtime but may lack TypeScript definitions
const secrets = (Bun as any).secrets as
  | {
      get(opts: { service: string; name: string }): Promise<string | null>
      set(opts: { service: string; name: string; value: string }): Promise<void>
      delete(opts: { service: string; name: string }): Promise<boolean>
    }
  | undefined

function secretsDir(): string {
  return join(getConfigDir(), 'secrets')
}

function secretPath(name: string): string {
  return join(secretsDir(), name)
}

export async function getSecret(name: string): Promise<string | null> {
  // Try keychain first
  try {
    const value = await secrets?.get({ service: SERVICE, name })
    if (value) return value
  } catch {
    // Bun.secrets unavailable — fall through to file
  }

  // File fallback
  try {
    return await Bun.file(secretPath(name)).text()
  } catch {
    return null
  }
}

export async function setSecret(name: string, value: string): Promise<void> {
  // Try keychain
  let keychainOk = false
  try {
    await secrets?.set({ service: SERVICE, name, value })
    keychainOk = !!secrets
  } catch {
    // Bun.secrets unavailable — fall through to file
  }

  if (!keychainOk) {
    // File fallback
    const dir = secretsDir()
    await mkdir(dir, { recursive: true })
    await Bun.write(secretPath(name), value)
  }
}

export async function deleteSecret(name: string): Promise<void> {
  // Clean up both locations in case of migration between environments
  try {
    await secrets?.delete({ service: SERVICE, name })
  } catch {
    // Bun.secrets unavailable
  }

  try {
    await unlink(secretPath(name))
  } catch {
    // File doesn't exist
  }
}
