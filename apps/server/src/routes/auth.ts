import { Elysia, t } from 'elysia'

import {
  getSession,
  saveSession,
  clearSession,
} from '../services/session/index.ts'
import { saveCredentials, clearCredentials } from '../libs/credentials.ts'
import type { SessionInfo } from '@tbana/ios-connect'

let loginPromise: Promise<void> | null = null
let pendingEmail: string | null = null
let pendingPassword: string | null = null

export const appleAccountRoutes = new Elysia({ prefix: '/apple-account' })
  .get('/', async (): Promise<SessionInfo> => {
    const session = await getSession()
    return await session.getSessionInfo()
  })

  .post(
    '/signin',
    async ({ body, set }) => {
      const { email, password } = body
      const session = await getSession()
      pendingEmail = email
      pendingPassword = password

      let httpResolved = false

      const result = await new Promise<
        { loggedIn: true } | { requiresTwoFa: true; type: string }
      >((resolveHttp, rejectHttp) => {
        // Store the raw login promise so /2fa can await it and catch errors
        // (chaining .then/.catch onto it would swallow rejections once httpResolved is true)
        loginPromise = session.login(email, password, twoFaInfo => {
          if (!httpResolved) {
            httpResolved = true
            resolveHttp({ requiresTwoFa: true, type: twoFaInfo.type })
          }
        })

        loginPromise
          .then(() => {
            if (!httpResolved) {
              httpResolved = true
              resolveHttp({ loggedIn: true })
            }
          })
          .catch((err: Error) => {
            if (!httpResolved) {
              httpResolved = true
              rejectHttp(err)
            }
          })
      }).catch((err: Error) => {
        set.status = 400
        return { message: err.message } as never
      })

      if (result && 'loggedIn' in result && result.loggedIn) {
        await saveCredentials(email, password)
        await saveSession(session)
      }

      return result
    },
    { body: t.Object({ email: t.String(), password: t.String() }) }
  )

  .post(
    '/2fa',
    async ({ body, set }) => {
      if (!loginPromise) {
        set.status = 400
        return { message: 'No pending 2FA' }
      }

      const { code } = body
      const session = await getSession()

      try {
        await session.submitTwoFa(code)
      } catch (err: unknown) {
        set.status = 400
        return { message: err instanceof Error ? err.message : String(err) }
      }

      const err = await loginPromise.then(() => null).catch((e: Error) => e)

      if (err) {
        // Wrong code — restart login so the user can try again without re-entering credentials
        if (pendingEmail && pendingPassword) {
          const email = pendingEmail
          const password = pendingPassword
          await new Promise<void>(resolve => {
            loginPromise = session.login(email, password, () => resolve())
            loginPromise.catch(() => {}) // suppress unhandled rejection until next /2fa
          })
        } else {
          loginPromise = null
        }
        set.status = 400
        return { message: err.message }
      }

      await saveCredentials(pendingEmail!, pendingPassword!)
      loginPromise = null
      pendingEmail = null
      pendingPassword = null
      await saveSession(await getSession())
      return { loggedIn: true }
    },
    { body: t.Object({ code: t.String() }) }
  )

  .post('/signout', async () => {
    loginPromise = null
    pendingEmail = null
    pendingPassword = null
    await clearCredentials()
    await clearSession()
    return { ok: true }
  })
