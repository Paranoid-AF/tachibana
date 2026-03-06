import { Elysia, t } from 'elysia'

export const health = new Elysia({ prefix: '/api/health' }).get(
  '/',
  () => ({ status: 'ok' }),
  {
    response: t.Object({
      status: t.String(),
    }),
  }
)
