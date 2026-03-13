import { join, resolve } from 'path'
import { mkdirSync } from 'fs'
import { Database } from 'bun:sqlite'
import { drizzle, type BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { eq } from 'drizzle-orm'

import { getConfigDir } from '../libs/config.ts'
import * as schema from './schema.ts'

import type { StoredSession } from '@tbana/ios-connect'

export interface DeviceMeta {
  name: string
  productType: string
  productVersion: string
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let sqlite: InstanceType<typeof Database> | null = null
let db: BunSQLiteDatabase<typeof schema> | null = null

function resolveMigrationsDir(): string {
  return resolve(import.meta.dirname!, '../../drizzle')
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function openDatabase(): void {
  const configDir = getConfigDir()
  const dbPath = join(configDir, 'storage.db')

  mkdirSync(configDir, { recursive: true })

  sqlite = new Database(dbPath, { create: true, strict: true })
  sqlite.exec('PRAGMA journal_mode = WAL')
  sqlite.exec('PRAGMA foreign_keys = ON')

  db = drizzle(sqlite, { schema })

  migrate(db, { migrationsFolder: resolveMigrationsDir() })

  acquireLock()
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close()
    sqlite = null
    db = null
  }
}

export function getDb(): BunSQLiteDatabase<typeof schema> {
  if (!db)
    throw new Error('Database not initialized — call openDatabase() first')
  return db
}

// ---------------------------------------------------------------------------
// Singleton lock
// ---------------------------------------------------------------------------

function acquireLock(): void {
  const d = getDb()

  try {
    d.insert(schema.serverLock)
      .values({ pid: process.pid, startedAt: Date.now() })
      .onConflictDoUpdate({
        target: schema.serverLock.id,
        set: { pid: process.pid, startedAt: Date.now() },
      })
      .run()
  } catch (err: any) {
    if (err?.code === 'SQLITE_BUSY') {
      try {
        const readSqlite = new Database(join(getConfigDir(), 'storage.db'), {
          readonly: true,
        })
        const readDb = drizzle(readSqlite, { schema })
        const row = readDb
          .select()
          .from(schema.serverLock)
          .where(eq(schema.serverLock.id, 1))
          .get()
        readSqlite.close()

        if (row) {
          try {
            process.kill(row.pid, 0)
            console.error(
              `Another tachibana server is already running (PID ${row.pid}). Kill it with: kill ${row.pid}`
            )
            process.exit(1)
          } catch {
            d.insert(schema.serverLock)
              .values({ pid: process.pid, startedAt: Date.now() })
              .onConflictDoUpdate({
                target: schema.serverLock.id,
                set: { pid: process.pid, startedAt: Date.now() },
              })
              .run()
          }
        }
      } catch {
        throw err
      }
    } else {
      throw err
    }
  }
}

// ---------------------------------------------------------------------------
// Device metadata
// ---------------------------------------------------------------------------

export function getDeviceMeta(udid: string): DeviceMeta | null {
  const d = getDb()
  const row = d
    .select({
      name: schema.devices.name,
      productType: schema.devices.productType,
      productVersion: schema.devices.productVersion,
    })
    .from(schema.devices)
    .where(eq(schema.devices.udid, udid))
    .get()
  return row ?? null
}

export function saveDeviceMeta(udid: string, meta: DeviceMeta): void {
  const d = getDb()
  d.insert(schema.devices)
    .values({
      udid,
      name: meta.name,
      productType: meta.productType,
      productVersion: meta.productVersion,
    })
    .onConflictDoUpdate({
      target: schema.devices.udid,
      set: {
        name: meta.name,
        productType: meta.productType,
        productVersion: meta.productVersion,
      },
    })
    .run()
}

// ---------------------------------------------------------------------------
// Device preferences
// ---------------------------------------------------------------------------

export interface DevicePrefs {
  alwaysAwake: boolean
}

const DEFAULT_PREFS: DevicePrefs = { alwaysAwake: true }

export function getDevicePrefs(udid: string): DevicePrefs {
  const d = getDb()
  const row = d
    .select({ prefAlwaysAwake: schema.devices.prefAlwaysAwake })
    .from(schema.devices)
    .where(eq(schema.devices.udid, udid))
    .get()
  if (!row) return { ...DEFAULT_PREFS }
  return { alwaysAwake: row.prefAlwaysAwake === 1 }
}

export function setDevicePrefs(
  udid: string,
  prefs: Partial<DevicePrefs>
): void {
  const d = getDb()
  const set: Record<string, unknown> = {}
  if (prefs.alwaysAwake !== undefined) {
    set.prefAlwaysAwake = prefs.alwaysAwake ? 1 : 0
  }
  if (Object.keys(set).length === 0) return
  d.update(schema.devices).set(set).where(eq(schema.devices.udid, udid)).run()
}

// ---------------------------------------------------------------------------
// Session data
// ---------------------------------------------------------------------------

export function getSessionData(): StoredSession | undefined {
  const d = getDb()
  const row = d
    .select({
      email: schema.session.email,
      token: schema.session.token,
      duration: schema.session.duration,
      expiry: schema.session.expiry,
      adsid: schema.session.adsid,
    })
    .from(schema.session)
    .where(eq(schema.session.id, 1))
    .get()
  return row ?? undefined
}

export function saveSessionData(data: StoredSession): void {
  const d = getDb()
  d.insert(schema.session)
    .values({
      id: 1,
      email: data.email,
      token: data.token,
      duration: data.duration,
      expiry: data.expiry,
      adsid: data.adsid,
    })
    .onConflictDoUpdate({
      target: schema.session.id,
      set: {
        email: data.email,
        token: data.token,
        duration: data.duration,
        expiry: data.expiry,
        adsid: data.adsid,
      },
    })
    .run()
}

export function clearSessionData(): void {
  const d = getDb()
  d.delete(schema.session).where(eq(schema.session.id, 1)).run()
}

// ---------------------------------------------------------------------------
// Admin auth — password
// ---------------------------------------------------------------------------

export function isPasswordSet(): boolean {
  return getPasswordEntry() !== null
}

export function getPasswordEntry(): {
  keyHash: string
  keyHashSalt: string
} | null {
  const d = getDb()
  const row = d
    .select({
      keyHash: schema.auth.keyHash,
      keyHashSalt: schema.auth.keyHashSalt,
    })
    .from(schema.auth)
    .where(eq(schema.auth.type, 'password'))
    .get()
  return row ?? null
}

export function upsertPassword(hash: string, salt: string): void {
  const d = getDb()
  const existing = d
    .select({ id: schema.auth.id })
    .from(schema.auth)
    .where(eq(schema.auth.type, 'password'))
    .get()

  const now = Date.now()
  if (existing) {
    d.update(schema.auth)
      .set({ keyHash: hash, keyHashSalt: salt, updatedAt: now })
      .where(eq(schema.auth.id, existing.id))
      .run()
  } else {
    d.insert(schema.auth)
      .values({
        type: 'password',
        keyHash: hash,
        keyHashSalt: salt,
        createdAt: now,
        updatedAt: now,
      })
      .run()
  }
}

export function updatePasswordLastUsed(): void {
  const d = getDb()
  d.update(schema.auth)
    .set({ lastUsedAt: Date.now() })
    .where(eq(schema.auth.type, 'password'))
    .run()
}

// ---------------------------------------------------------------------------
// Admin auth — API tokens
// ---------------------------------------------------------------------------

export interface TokenRow {
  id: number
  name: string | null
  keyPrefix: string | null
  expiresAt: number | null
  lastUsedAt: number | null
  createdAt: number
}

export function insertToken(
  name: string,
  keyHash: string,
  salt: string,
  keyPrefix: string,
  expiresAt?: number
): number {
  const d = getDb()
  const now = Date.now()
  const result = d
    .insert(schema.auth)
    .values({
      type: 'token',
      name,
      keyHash,
      keyHashSalt: salt,
      keyPrefix,
      expiresAt: expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.auth.id })
    .get()
  return result.id
}

export function listTokens(): TokenRow[] {
  const d = getDb()
  return d
    .select({
      id: schema.auth.id,
      name: schema.auth.name,
      keyPrefix: schema.auth.keyPrefix,
      expiresAt: schema.auth.expiresAt,
      lastUsedAt: schema.auth.lastUsedAt,
      createdAt: schema.auth.createdAt,
    })
    .from(schema.auth)
    .where(eq(schema.auth.type, 'token'))
    .all()
}

export function getTokenById(id: number): TokenRow | null {
  const d = getDb()
  const row = d
    .select({
      id: schema.auth.id,
      name: schema.auth.name,
      keyPrefix: schema.auth.keyPrefix,
      expiresAt: schema.auth.expiresAt,
      lastUsedAt: schema.auth.lastUsedAt,
      createdAt: schema.auth.createdAt,
    })
    .from(schema.auth)
    .where(eq(schema.auth.id, id))
    .get()
  return row ?? null
}

export function getAllTokenHashes(): {
  id: number
  keyHash: string
  keyHashSalt: string
  keyPrefix: string | null
  expiresAt: number | null
}[] {
  const d = getDb()
  return d
    .select({
      id: schema.auth.id,
      keyHash: schema.auth.keyHash,
      keyHashSalt: schema.auth.keyHashSalt,
      keyPrefix: schema.auth.keyPrefix,
      expiresAt: schema.auth.expiresAt,
    })
    .from(schema.auth)
    .where(eq(schema.auth.type, 'token'))
    .all()
}

export function updateTokenLastUsed(id: number): void {
  const d = getDb()
  d.update(schema.auth)
    .set({ lastUsedAt: Date.now() })
    .where(eq(schema.auth.id, id))
    .run()
}

export function renameToken(id: number, name: string): void {
  const d = getDb()
  d.update(schema.auth)
    .set({ name, updatedAt: Date.now() })
    .where(eq(schema.auth.id, id))
    .run()
}

export function deleteToken(id: number): void {
  const d = getDb()
  d.delete(schema.auth).where(eq(schema.auth.id, id)).run()
}
