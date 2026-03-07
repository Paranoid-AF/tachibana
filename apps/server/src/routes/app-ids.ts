import { Elysia, t } from 'elysia'
import { appId } from '@tachibana/ios-connect'
import { getConfig } from '../libs/config.ts'

const credentialsOpts = async () => {
  const config = await getConfig()
  return {
    credentials: {
      appleAccount: config.credentials.appleAccount,
      password: config.credentials.password,
    },
  }
}

export const appIds = new Elysia({ prefix: '/api/app-ids' })
  .get('/', async ({ set }) => {
    const result = await appId.list(await credentialsOpts())
    if (!result.success) {
      set.status = 400
      return { error: result.error }
    }
    return { data: result.data }
  })
  .post(
    '/',
    async ({ body, set }) => {
      const result = await appId.register(
        body.bundleId,
        body.name,
        await credentialsOpts()
      )
      if (!result.success) {
        set.status = 400
        return { error: result.error }
      }
      return { data: result.data }
    },
    {
      body: t.Object({
        bundleId: t.String(),
        name: t.String(),
      }),
    }
  )
