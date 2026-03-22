import { Elysia } from 'elysia'
import { jwt } from '@elysiajs/jwt'

import { getOrCreateJwtSecret } from './admin.ts'
import { verifyApiToken } from './admin.ts'
import { isPasswordSet } from '../../db/index.ts'
import { JWT_EXPIRY } from '../../consts/auth.ts'

// ---------------------------------------------------------------------------
// JWT plugin — must be .use()'d before guards that need jwt in context
// ---------------------------------------------------------------------------

export const jwtPlugin = new Elysia({ name: 'jwt-plugin' }).use(
  jwt({
    name: 'jwt',
    secret: await getOrCreateJwtSecret(),
    exp: JWT_EXPIRY,
  })
)

// ---------------------------------------------------------------------------
// Admin auth guard — checks session cookie (JWT)
// ---------------------------------------------------------------------------

export const adminAuthGuard = new Elysia({ name: 'admin-auth-guard' })
  .use(jwtPlugin)
  .onBeforeHandle(async ({ jwt: jwtCtx, cookie, set }) => {
    // If no password is set, allow all requests (first-time setup)
    if (!isPasswordSet()) return

    const token = cookie.session?.value as string | undefined
    if (!token) {
      set.status = 401
      return { message: 'Not authenticated' }
    }

    const payload = await jwtCtx.verify(token)
    if (!payload) {
      set.status = 401
      return { message: 'Invalid or expired session' }
    }
  })

// ---------------------------------------------------------------------------
// API token guard — checks Authorization: Bearer header
// ---------------------------------------------------------------------------

export const apiTokenGuard = new Elysia({
  name: 'api-token-guard',
})
  .resolve(async ({ headers }) => {
    const authHeader = headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return { apiAuthId: null as number | null }
    }
    const token = authHeader.slice(7)
    const result = await verifyApiToken(token)
    if (!result.valid) {
      return { apiAuthId: null as number | null }
    }
    return { apiAuthId: result.authId ?? null }
  })
  .onBeforeHandle(({ apiAuthId, set }) => {
    if (apiAuthId === null) {
      set.status = 401
      return { message: 'Missing or invalid bearer token' }
    }
  })
