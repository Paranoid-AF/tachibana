import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const serverLock = sqliteTable('_server_lock', {
  id: integer('id')
    .primaryKey()
    .$default(() => 1),
  pid: integer('pid').notNull(),
  startedAt: integer('started_at').notNull(),
})

export const devices = sqliteTable('devices', {
  udid: text('udid').primaryKey(),
  name: text('name').notNull(),
  productType: text('product_type').notNull(),
  productVersion: text('product_version').notNull(),
  prefAlwaysAwake: integer('pref_always_awake').notNull().default(1),
})

export const session = sqliteTable('session', {
  id: integer('id')
    .primaryKey()
    .$default(() => 1),
  email: text('email').notNull(),
  token: text('token').notNull(),
  duration: integer('duration').notNull(),
  expiry: integer('expiry').notNull(),
  adsid: text('adsid').notNull(),
})

export const auth = sqliteTable('auth', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(), // 'password' | 'token'
  name: text('name'), // label for tokens; null for password
  keyHash: text('key_hash').notNull(),
  keyHashSalt: text('key_hash_salt').notNull(),
  keyPrefix: text('key_prefix'), // first ~16 chars of token; null for password
  expiresAt: integer('expires_at'), // unix ms; null = never
  lastUsedAt: integer('last_used_at'), // unix ms
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})
