import path from 'node:path'
import http from 'node:http'

import { Elysia } from 'elysia'

import { getConfig, getConfigDir } from './libs/config.ts'
import * as routes from './routes/index.ts'
import { adminAuthGuard } from './libs/auth-middleware.ts'
import {
  buildHttpRequest,
  handleElysiaResponse,
  handleElysiaStaticRoute,
} from './libs/http.ts'
import { handleMcpRequest } from './routes/agent.ts'
import { ensureElevated } from './libs/elevate.ts'
import { deviceManager } from './libs/device-manager.ts'
import { openDatabase, closeDatabase } from './db/index.ts'
import type { ViteDevServer } from 'vite'

const isDev = Bun.env.NODE_ENV === 'development'

const isCompiled =
  process.argv[0] === process.execPath &&
  !process.execPath.includes('node_modules')

const webDevPath = path.resolve(import.meta.dirname!, '../../web')
const webDistPath = isCompiled
  ? path.resolve(path.dirname(process.execPath), 'web')
  : path.resolve(import.meta.dirname!, '../../web/dist')

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
  // Agent routes (Bearer token auth, self-contained)
  .use(routes.agentRoutes)
  // Protected routes (require admin login)
  .use(adminAuthGuard)
  .use(routes.appleAccountRoutes)
  .use(routes.deviceRoutes)
  .use(routes.apiTokenRoutes)

export const app = _app
export type App = typeof _app

const main = async () => {
  const config = await getConfig(isDev)

  const port = config.server.port
  const host = config.server.host
  const baseUrl = `http://${host}:${port}`

  const server = http.createServer()

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      const configPath = path.join(getConfigDir(), 'config.json')
      console.error(
        `\n❌ Port ${port} is already in use.\n` +
          `   Either stop the other process using this port, or change the port in:\n` +
          `   ${configPath}\n`
      )
      process.exit(1)
    }
    throw err
  })

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
    // Intercept MCP requests at HTTP level (before Elysia)
    if (pathname.startsWith('/api/agent/mcp')) {
      await handleMcpRequest(req, res)
      return
    }
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

  server.listen(port, host)

  deviceManager.start()
}

await ensureElevated()
openDatabase()
main().catch(console.error)

export type { DeviceListResponseItem } from './routes/devices.ts'
