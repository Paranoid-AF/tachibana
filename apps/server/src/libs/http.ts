import type { AnyElysia } from 'elysia'
import http from 'node:http'
import path from 'node:path'

export const buildHttpRequest = async (
  url: string,
  req: http.IncomingMessage
) => {
  const { method } = req

  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  const chunks: Buffer[] = []
  req.on('data', (chunk: Buffer) => chunks.push(chunk))
  await new Promise<void>((resolve, reject) => {
    req.on('end', resolve)
    req.on('error', reject)
  })
  const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined

  return new Request(url, { method, headers, body })
}

export const handleElysiaResponse =
  (req: http.IncomingMessage, res: http.ServerResponse) =>
  async (response: Response) => {
    const resHeaders: Record<string, string> = {}
    response.headers.forEach((v, k) => {
      resHeaders[k] = v
    })

    res.writeHead(response.status, resHeaders)

    if (response.body) {
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
      }
    }

    res.end()
  }

export const handleElysiaStaticRoute = (app: AnyElysia, webDistPath: string) => {
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
