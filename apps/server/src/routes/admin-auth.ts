import { Elysia, t } from 'elysia'

import { isPasswordSet } from '../db/index.ts'
import {
  setAdminPassword,
  verifyAdminPassword,
  regenerateJwtSecret,
} from '../services/auth/admin.ts'
import { jwtPlugin } from '../services/auth/middleware.ts'
import { COOKIE_MAX_AGE } from '../consts/auth.ts'

function setSessionCookie(cookie: any, token: string) {
  cookie.session.set({
    value: token,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
  })
}

export const adminAuthRoutes = new Elysia({ prefix: '/admin' })
  .use(jwtPlugin)

  .get('/', async ({ jwt, cookie }) => {
    const passwordSet = isPasswordSet()
    let loggedIn = false

    if (passwordSet) {
      const token = cookie.session?.value as string | undefined
      if (token) {
        const payload = await jwt.verify(token)
        loggedIn = !!payload
      }
    }

    return { passwordSet, loggedIn }
  })

  .post(
    '/setup',
    async ({ body, jwt, cookie, set }) => {
      if (isPasswordSet()) {
        set.status = 400
        return { message: 'Admin password is already set' }
      }

      await setAdminPassword(body.password)

      const token = await jwt.sign({ sub: 'admin' })
      setSessionCookie(cookie, token)

      return { ok: true }
    },
    { body: t.Object({ password: t.String({ minLength: 8 }) }) }
  )

  .post(
    '/login',
    async ({ body, jwt, cookie, set }) => {
      const valid = await verifyAdminPassword(body.password)
      if (!valid) {
        set.status = 401
        return { message: 'Invalid password' }
      }

      const token = await jwt.sign({ sub: 'admin' })
      setSessionCookie(cookie, token)

      return { ok: true }
    },
    { body: t.Object({ password: t.String() }) }
  )

  .post('/logout', ({ cookie }) => {
    cookie.session.remove()
    return { ok: true }
  })

  .post(
    '/change-password',
    async ({ body, jwt, cookie, set }) => {
      // Must be logged in
      const sessionToken = cookie.session?.value as string | undefined
      if (!sessionToken) {
        set.status = 401
        return { message: 'Not authenticated' }
      }
      const payload = await jwt.verify(sessionToken)
      if (!payload) {
        set.status = 401
        return { message: 'Invalid or expired session' }
      }

      const valid = await verifyAdminPassword(body.currentPassword)
      if (!valid) {
        set.status = 400
        return { message: 'Current password is incorrect' }
      }

      await setAdminPassword(body.newPassword)
      await regenerateJwtSecret()
      cookie.session.remove()

      return { ok: true }
    },
    {
      body: t.Object({
        currentPassword: t.String(),
        newPassword: t.String({ minLength: 8 }),
      }),
    }
  )
