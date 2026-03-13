import path from 'node:path'
import http from 'node:http'
import getPort from 'get-port'

import { Elysia } from 'elysia'

import { getConfig } from './libs/config.ts'
import * as routes from './routes/index.ts'
import { adminAuthGuard } from './libs/auth-middleware.ts'
import {
  buildHttpRequest,
  handleElysiaResponse,
  handleElysiaStaticRoute,
} from './libs/http.ts'
import { ensureElevated } from './libs/elevate.ts'
import { deviceManager } from './libs/device-manager.ts'
import { openDatabase, closeDatabase } from './db/index.ts'
import type { ViteDevServer } from 'vite'

const isDev = Bun.env.NODE_ENV === 'development'
const __dirname = import.meta.dirname!

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
  // Public routes
  .use(routes.health)
  .use(routes.adminAuthRoutes)
  // Protected routes (require admin login)
  .use(adminAuthGuard)
  .use(routes.appleAccountRoutes)
  .use(routes.deviceRoutes)
  .use(routes.apiTokenRoutes)

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

  const shutdown = async () => {
    await deviceManager.stop()
    closeDatabase()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  console.info(`🍊 Server is running on ${baseUrl}`)

  server.listen(port, hostname)

  deviceManager.start()
}

await ensureElevated()
openDatabase()
main().catch(console.error)

export type { DeviceListResponseItem } from './routes/devices.ts'
