import { Elysia, t } from 'elysia'
import { sideloader } from '@tachibana/ios-connect'
import { getConfig } from '../libs/config.ts'

export const apps = new Elysia({ prefix: '/api/apps' })
  .post(
    '/install',
    async ({ body, set }) => {
      const config = await getConfig()
      const result = await sideloader.install(body.ipaPath, {
        credentials: {
          appleAccount: config.credentials.appleAccount,
          password: config.credentials.password,
        },
        udid: body.udid,
      })
      if (!result.success) {
        set.status = 400
        return { error: result.error }
      }
      return { data: result.data }
    },
    {
      body: t.Object({
        ipaPath: t.String(),
        udid: t.String(),
      }),
    }
  )
  .post(
    '/sign',
    async ({ body, set }) => {
      const config = await getConfig()
      const result = await sideloader.sign(body.ipaPath, {
        credentials: {
          appleAccount: config.credentials.appleAccount,
          password: config.credentials.password,
        },
      })
      if (!result.success) {
        set.status = 400
        return { error: result.error }
      }
      return { data: result.data }
    },
    {
      body: t.Object({
        ipaPath: t.String(),
      }),
    }
  )
