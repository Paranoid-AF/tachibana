import { Elysia } from 'elysia'
import http from 'node:http'
import path from 'node:path'

export const buildRequest = async (url: string, req: http.IncomingMessage) => {
  const { method } = req

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const chunks: Buffer[] = []
  if (hasBody) {
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    await new Promise<void>(resolve => req.on('end', resolve))
  }
  const body = hasBody && chunks.length > 0 ? Buffer.concat(chunks) : undefined

  return new Request(url, { method, headers, body })
}

export const handleElysiaResponse =
  (req: http.IncomingMessage, res: http.ServerResponse) =>
  async (response: Response) => {
    const resHeaders: Record<string, string> = {}
    response.headers.forEach((v, k) => {
      resHeaders[k] = v
    })

    const contentType = response.headers.get('content-type') || ''

    if (contentType.startsWith('text/event-stream') && response.body) {
      res.writeHead(response.status, resHeaders)
      const reader = response.body.getReader()
      req.on('close', () => reader.cancel().catch(() => {}))
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const ok = res.write(value)
          if (!ok) await new Promise<void>(r => res.once('drain', r))
        }
      } catch {
        // Client disconnected
      } finally {
        res.end()
      }
    } else {
      res.writeHead(response.status, resHeaders)
      const buf = await response.arrayBuffer()
      res.end(Buffer.from(buf))
    }
  }

export const handleElysiaStaticRoute = (app: Elysia, webDistPath: string) => {
  app.get('/*', async ({ request, set }) => {
    const url = new URL(request.url)
    const pathname = url.pathname

    const resolved = path.resolve(webDistPath, '.' + pathname)
    if (!resolved.startsWith(webDistPath)) {
      set.status = 400
      return { status: 400, error: { message: 'Bad request' } }
    }

    const filePath = pathname === '/' ? '/index.html' : pathname
    const file = Bun.file(path.join(webDistPath, filePath))

    if (!(await file.exists())) {
      return new Response(Bun.file(path.join(webDistPath, 'index.html')), {
        headers: { 'Cache-Control': 'no-cache' },
      })
    }

    const isAsset = pathname.startsWith('/assets/')
    return new Response(file, {
      headers: {
        'Cache-Control': isAsset
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      },
    })
  })
}
