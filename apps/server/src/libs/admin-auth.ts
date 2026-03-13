import { randomBytes } from 'crypto'

import {
  getPasswordEntry,
  upsertPassword,
  updatePasswordLastUsed,
  insertToken,
  getAllTokenHashes,
  updateTokenLastUsed,
} from '../db/index.ts'

const SERVICE = 'tachibana'
const JWT_SECRET_NAME = 'jwt-secret'

// Bun.secrets typed the same way as in credentials.ts
const secrets = (Bun as any).secrets as
  | {
      get(opts: { service: string; name: string }): Promise<string | null>
      set(opts: { service: string; name: string; value: string }): Promise<void>
      delete(opts: { service: string; name: string }): Promise<boolean>
    }
  | undefined

// ---------------------------------------------------------------------------
// JWT secret — stored in OS keychain
// ---------------------------------------------------------------------------

export async function getOrCreateJwtSecret(): Promise<string> {
  try {
    const existing = await secrets?.get({
      service: SERVICE,
      name: JWT_SECRET_NAME,
    })
    if (existing) return existing
  } catch {
    // Bun.secrets unavailable — fall through to generate
  }

  const secret = randomBytes(64).toString('hex')
  try {
    await secrets?.set({
      service: SERVICE,
      name: JWT_SECRET_NAME,
      value: secret,
    })
  } catch {
    // Silently continue — secret will only live in memory
  }
  return secret
}

export async function regenerateJwtSecret(): Promise<string> {
  const secret = randomBytes(64).toString('hex')
  try {
    await secrets?.set({
      service: SERVICE,
      name: JWT_SECRET_NAME,
      value: secret,
    })
  } catch {
    // Silently continue
  }
  return secret
}

// ---------------------------------------------------------------------------
// Admin password
// ---------------------------------------------------------------------------

export async function setAdminPassword(plaintext: string): Promise<void> {
  const salt = randomBytes(32).toString('hex')
  const hash = await Bun.password.hash(salt + plaintext, {
    algorithm: 'argon2id',
  })
  upsertPassword(hash, salt)
}

export async function verifyAdminPassword(plaintext: string): Promise<boolean> {
  const entry = getPasswordEntry()
  if (!entry) return false

  const valid = await Bun.password.verify(
    entry.keyHashSalt + plaintext,
    entry.keyHash
  )
  if (valid) {
    updatePasswordLastUsed()
  }
  return valid
}

// ---------------------------------------------------------------------------
// API tokens
// ---------------------------------------------------------------------------

const TOKEN_PREFIX = 'sk-or-v1-'

export async function createApiToken(
  name: string,
  expiresAt?: number
): Promise<{ id: number; key: string }> {
  const raw = randomBytes(32).toString('hex')
  const key = TOKEN_PREFIX + raw
  const keyPrefix = key.slice(0, 16)
  const salt = randomBytes(32).toString('hex')
  const hash = await Bun.password.hash(salt + key, { algorithm: 'argon2id' })
  const id = insertToken(name, hash, salt, keyPrefix, expiresAt)
  return { id, key }
}

export async function verifyApiToken(bearerToken: string): Promise<boolean> {
  if (!bearerToken.startsWith(TOKEN_PREFIX)) return false

  const prefix = bearerToken.slice(0, 16)
  const allHashes = getAllTokenHashes()

  // Narrow by prefix first
  const candidates = allHashes.filter(t => t.keyPrefix === prefix)
  if (candidates.length === 0) return false

  for (const candidate of candidates) {
    // Check expiry
    if (candidate.expiresAt && candidate.expiresAt < Date.now()) continue

    const valid = await Bun.password.verify(
      candidate.keyHashSalt + bearerToken,
      candidate.keyHash
    )
    if (valid) {
      updateTokenLastUsed(candidate.id)
      return true
    }
  }

  return false
}
