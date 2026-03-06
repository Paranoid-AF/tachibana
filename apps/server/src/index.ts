import path from 'node:path'
import http from 'node:http'
import getPort from 'get-port'
import { fileURLToPath } from 'node:url'

import { Elysia } from 'elysia'

import { getConfig } from './libs/config.ts'
import * as routes from './routes/index.ts'
import {
  buildRequest,
  handleElysiaResponse,
  handleElysiaStaticRoute,
} from './libs/http.ts'

const isDev = process.env.NODE_ENV === 'development'
const __dirname = fileURLToPath(new URL('.', import.meta.url))
const webDevPath = path.resolve(__dirname, '../../../web')
const webDistPath = path.resolve(__dirname, '../../../web/dist')

export const app = new Elysia()
export type App = typeof app

// Register routes from barrel file
Object.values(routes).reduce(
  (app: App, route: Parameters<typeof app.use>[0]) => app.use(route),
  app
)

const main = async () => {
  const config = await getConfig(isDev)

  const port = await getPort({ port: config.server.port })
  const hostname = config.server.hostname
  const baseUrl = `http://${hostname}:${port}`

  const server = http.createServer()

  if (isDev) {
    // Use live Vite server for development
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
      root: webDevPath,
      server: {
        proxy: {
          '/api': `http://${hostname}:${port}`,
        },
      },
      appType: 'spa',
    })

    server.on('request', async (req, res) => {
      const pathname = req.url || '/'
      const url = new URL(pathname, baseUrl).toString()

      if (pathname.startsWith('/api/')) {
        app
          .handle(await buildRequest(url, req))
          .then(handleElysiaResponse(req, res))
      } else {
        vite.middlewares(req, res)
      }
    })
  } else {
    // Use static file server for production
    handleElysiaStaticRoute(app, webDistPath)
  }

  process.on('SIGINT', () => process.exit(0))
  process.on('SIGTERM', () => process.exit(0))

  server.listen(port, hostname)
}

main().catch(console.error)
