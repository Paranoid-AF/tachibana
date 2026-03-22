import { Elysia, t } from 'elysia'

import { listTokens, renameToken, deleteToken } from '../db/index.ts'
import { createApiToken } from '../service/auth/admin.ts'
import { adminAuthGuard } from '../service/auth/middleware.ts'

export const apiTokenRoutes = new Elysia({ prefix: '/tokens' })
  .use(adminAuthGuard)

  .get('/', () => {
    return listTokens()
  })

  .post(
    '/',
    async ({ body }) => {
      const { id, key } = await createApiToken(body.name, body.expiresAt)
      return { id, name: body.name, key }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
        expiresAt: t.Optional(t.Number()),
      }),
    }
  )

  .patch(
    '/:id',
    ({ params, body, set }) => {
      const id = Number(params.id)
      if (Number.isNaN(id)) {
        set.status = 400
        return { message: 'Invalid token id' }
      }
      renameToken(id, body.name)
      return { ok: true }
    },
    {
      body: t.Object({
        name: t.String({ minLength: 1 }),
      }),
    }
  )

  .delete('/:id', ({ params, set }) => {
    const id = Number(params.id)
    if (Number.isNaN(id)) {
      set.status = 400
      return { message: 'Invalid token id' }
    }
    deleteToken(id)
    return { ok: true }
  })
