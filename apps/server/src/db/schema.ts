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
