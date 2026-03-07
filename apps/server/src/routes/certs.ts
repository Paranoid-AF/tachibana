import { Elysia } from 'elysia'
import { cert } from '@tachibana/ios-connect'
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

export const certs = new Elysia({ prefix: '/api/certs' })
  .get('/', async ({ set }) => {
    const result = await cert.list(await credentialsOpts())
    if (!result.success) {
      set.status = 400
      return { error: result.error }
    }
    return { data: result.data }
  })
  .delete('/:serialNumber', async ({ params, set }) => {
    const result = await cert.revoke(params.serialNumber, await credentialsOpts())
    if (!result.success) {
      set.status = 400
      return { error: result.error }
    }
    return { data: result.data }
  })
