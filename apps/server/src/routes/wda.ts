import { Elysia, t } from 'elysia'
import { wdaClient } from '@tachibana/ios-connect'

export const wda = new Elysia({ prefix: '/api/wda' })
  .get(
    '/status',
    async ({ query, set }) => {
      try {
        const client = new wdaClient.WdaClient(query.baseUrl)
        const status = await client.getStatus()
        return { data: status }
      } catch (err) {
        set.status = 400
        return {
          error: {
            code: 'WDA_UNREACHABLE',
            message: err instanceof Error ? err.message : String(err),
          },
        }
      }
    },
    {
      query: t.Object({
        baseUrl: t.String(),
      }),
    }
  )
  .post(
    '/session',
    async ({ body, set }) => {
      try {
        const client = new wdaClient.WdaClient(body.baseUrl)
        const session = new wdaClient.WdaSession(client)
        const sessionId = await session.ensureSession()
        return { data: { sessionId } }
      } catch (err) {
        set.status = 400
        return {
          error: {
            code: 'SESSION_FAILED',
            message: err instanceof Error ? err.message : String(err),
          },
        }
      }
    },
    {
      body: t.Object({
        baseUrl: t.String(),
        capabilities: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    }
  )
  .delete(
    '/session/:sessionId',
    async ({ params, query, set }) => {
      try {
        const client = new wdaClient.WdaClient(query.baseUrl)
        await client.deleteSession(params.sessionId)
        return { data: 'Session deleted' }
      } catch (err) {
        set.status = 400
        return {
          error: {
            code: 'SESSION_DELETE_FAILED',
            message: err instanceof Error ? err.message : String(err),
          },
        }
      }
    },
    {
      query: t.Object({
        baseUrl: t.String(),
      }),
    }
  )
