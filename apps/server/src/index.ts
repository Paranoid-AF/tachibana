import path from 'node:path'
import http from 'node:http'
import getPort from 'get-port'
import { fileURLToPath } from 'node:url'

import { Elysia } from 'elysia'

import { getConfig } from './libs/config.ts'
import * as routes from './routes/index.ts'
import {
  buildHttpRequest,
  handleElysiaResponse,
  handleElysiaStaticRoute,
} from './libs/http.ts'
import type { ViteDevServer } from 'vite'

const isDev = process.env.NODE_ENV === 'development'
const __dirname = fileURLToPath(new URL('.', import.meta.url))

const webDevPath = path.resolve(__dirname, '../../web')
const webDistPath = path.resolve(__dirname, '../../web/dist')

const _app = new Elysia({ prefix: '/api' })
  .onError(({ error, set, code }) => {
    set.headers['content-type'] = 'application/json'
    if (code === 'NOT_FOUND') set.status = 404
    else if (code === 'VALIDATION') set.status = 400
    else set.status = 500
    const message = error instanceof Error ? error.message : String(error)
    return { message }
  })
  .use(routes.health)
  .use(routes.authRoutes)
  .use(routes.deviceRoutes)

export const app = _app
export type App = typeof _app

const main = async () => {
  const config = await getConfig(isDev)

  const port = await getPort({ port: config.server.port })
  const hostname = config.server.hostname
  const baseUrl = `http://${hostname}:${port}`

  const server = http.createServer()

  let vite: ViteDevServer | null = null

  if (isDev) {
    // Use live Vite server for development
    const { createServer: createViteServer } = await import('vite')
    vite = await createViteServer({
      root: webDevPath,
      server: {
        middlewareMode: true,
        hmr: { server }, // Use same server for HMR WebSocket
      },
      appType: 'spa',
    })
  } else {
    // Use static file server for production
    handleElysiaStaticRoute(app, webDistPath)
  }

  server.on('request', async (req, res) => {
    const pathname = req.url || '/'
    const url = new URL(pathname, baseUrl).toString()
    if (vite && !pathname.startsWith('/api/')) {
      vite.middlewares(req, res)
    } else {
      app
        .handle(await buildHttpRequest(url, req))
        .then(handleElysiaResponse(req, res))
    }
  })

  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))

  console.info(`🍊 Server is running on ${baseUrl}`)

  server.listen(port, hostname)
}

main().catch(console.error)
