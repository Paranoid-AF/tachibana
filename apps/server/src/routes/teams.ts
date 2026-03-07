import { Elysia } from 'elysia'
import { team } from '@tachibana/ios-connect'
import { getConfig } from '../libs/config.ts'

export const teams = new Elysia({ prefix: '/api/teams' }).get(
  '/',
  async ({ set }) => {
    const config = await getConfig()
    const result = await team.list({
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
  }
)
