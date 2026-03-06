import { Elysia, t } from 'elysia'

export const health = new Elysia().get('/health', () => ({ status: 'ok' }), {
  response: t.Object({
    status: t.String(),
  }),
})
