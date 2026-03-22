import './lib/sharp-native.ts'
import path from 'node:path'
import http from 'node:http'

import { Elysia } from 'elysia'

import { getConfig, getConfigDir } from './lib/config.ts'
import * as routes from './route/index.ts'
import { adminAuthGuard } from './service/auth/middleware.ts'
import {
  buildHttpRequest,
  handleElysiaResponse,
  serveStaticFile,
} from './lib/http.ts'
import { handleMcpRequest } from './route/agent.ts'
import { ensureElevated } from './lib/elevate.ts'
import { deviceManager } from './service/device/manager.ts'
import { openDatabase, closeDatabase } from './db/index.ts'
import { isCompiled, serverDir } from './lib/runtime.ts'
import type { ViteDevServer } from 'vite'

const isDev = Bun.env.NODE_ENV === 'development'

const webDevPath = path.resolve(import.meta.dirname!, '../../web')
const webDistPath = isCompiled
  ? path.resolve(serverDir, 'web')
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
  }

  server.on('request', async (req, res) => {
    const pathname = req.url || '/'
    // Intercept MCP requests at HTTP level (before Elysia)
    if (
      pathname === '/api/agent/mcp' ||
      pathname.startsWith('/api/agent/mcp/') ||
      pathname.startsWith('/api/agent/mcp?')
    ) {
      await handleMcpRequest(req, res)
      return
    }
    if (!pathname.startsWith('/api/')) {
      // Static files: Vite in dev, direct file serving in production
      if (vite) {
        vite.middlewares(req, res)
      } else {
        serveStaticFile(res, webDistPath, pathname)
      }
    } else {
      const url = new URL(pathname, baseUrl).toString()
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

try {
  await ensureElevated()
  openDatabase()
  await main()
} catch (err) {
  console.error(err)
  process.exit(1)
}

export type { DeviceListResponseItem } from './route/devices.ts'
