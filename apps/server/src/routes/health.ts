import { Elysia, t } from 'elysia'

export const health = new Elysia({ prefix: '/health' }).get(
  '/',
  () => ({ status: 'ok' }),
  {
    response: t.Object({
      status: t.String(),
    }),
  }
)
