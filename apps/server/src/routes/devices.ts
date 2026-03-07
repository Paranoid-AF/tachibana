import { Elysia, t } from 'elysia'
import { device, screenshot } from '@tachibana/ios-connect'
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

export const devices = new Elysia({ prefix: '/api/devices' })
  .get('/connected', async () => {
    const result = await device.listConnected()
    if (!result.success) return { error: result.error }
    return { data: result.data }
  })
  .get('/', async ({ set }) => {
    const result = await device.list(await credentialsOpts())
    if (!result.success) {
      set.status = 400
      return { error: result.error }
    }
    return { data: result.data }
  })
  .post(
    '/',
    async ({ body, set }) => {
      const result = await device.register(
        body.udid,
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
        udid: t.String(),
        name: t.String(),
      }),
    }
  )
  .post(
    '/:udid/screenshot',
    async ({ params, body, set }) => {
      const result = await screenshot.screenshot(params.udid, body.outputPath)
      if (!result.success) {
        set.status = 400
        return { error: result.error }
      }
      return { data: result.data }
    },
    {
      body: t.Object({
        outputPath: t.String(),
      }),
    }
  )
