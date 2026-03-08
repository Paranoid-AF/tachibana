import { Elysia, t } from 'elysia'

import { getSession } from '../libs/session.ts'
import { setConfig } from '../libs/config.ts'

type PendingTwoFa = {
  resolve: (code: string) => void
  reject: (err: Error) => void
  type: string
}

let loginPromise: Promise<void> | null = null
let pendingTwoFa: PendingTwoFa | null = null

export const authRoutes = new Elysia({ prefix: '/auth' })
  .get('/session', async () => {
    const session = await getSession()
    return session.getSessionInfo()
  })

  .post(
    '/signin',
    async ({ body, set }) => {
      const { email, password } = body
      const session = await getSession()

      // Cancel any prior in-flight login
      if (pendingTwoFa) {
        pendingTwoFa.reject(new Error('New sign-in attempt started'))
        pendingTwoFa = null
      }

      let httpResolved = false

      const result = await new Promise<
        { loggedIn: true } | { requiresTwoFa: true; type: string }
      >((resolveHttp, rejectHttp) => {
        loginPromise = session
          .login(email, password, (twoFaInfo) => {
            if (!httpResolved) {
              httpResolved = true
              resolveHttp({ requiresTwoFa: true, type: twoFaInfo.type })
            }
            return new Promise<string>((resolveCode, rejectCode) => {
              pendingTwoFa = { resolve: resolveCode, reject: rejectCode, type: twoFaInfo.type }
            })
          })
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
        await setConfig({ appleAccount: { handle: email, password } })
      }

      return result
    },
    { body: t.Object({ email: t.String(), password: t.String() }) }
  )

  .post(
    '/2fa',
    async ({ body, set }) => {
      if (!pendingTwoFa || !loginPromise) {
        set.status = 400
        return { message: 'No pending 2FA' }
      }

      const { code } = body
      const resolve = pendingTwoFa.resolve
      pendingTwoFa = null

      resolve(code)

      const err = await loginPromise.then(() => null).catch((e: Error) => e)
      loginPromise = null

      if (err) {
        set.status = 400
        return { message: err.message }
      }

      return { loggedIn: true }
    },
    { body: t.Object({ code: t.String() }) }
  )

  .post('/signout', async () => {
    if (pendingTwoFa) {
      pendingTwoFa.reject(new Error('Signed out'))
      pendingTwoFa = null
    }
    loginPromise = null
    await setConfig({ appleAccount: { handle: null, password: null } })
    return { ok: true }
  })
