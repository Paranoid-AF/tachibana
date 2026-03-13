import type { IncomingMessage, ServerResponse } from 'node:http'

import { Elysia, t } from 'elysia'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { apiTokenGuard } from '../libs/auth-middleware.ts'
import { verifyApiToken } from '../libs/admin-auth.ts'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { allTools, toolMap } from '../libs/agent-tools.ts'

// ---------------------------------------------------------------------------
// Skill route (Elysia)
// ---------------------------------------------------------------------------

export const agentRoutes = new Elysia({ prefix: '/agent' })
  .use(apiTokenGuard)
  .post(
    '/skill',
    async ({ body, set }) => {
      const { tool, parameters } = body
      const def = toolMap.get(tool)
      if (!def) {
        set.status = 400
        return { error: `Unknown tool: ${tool}` }
      }
      try {
        const parsed = def.inputSchema.parse(parameters ?? {})
        const result = await def.handler(parsed)
        return unwrapSkillResult(result)
      } catch (err: any) {
        set.status = 500
        return { error: err.message ?? String(err) }
      }
    },
    {
      body: t.Object({
        tool: t.String(),
        parameters: t.Optional(t.Record(t.String(), t.Unknown())),
      }),
    }
  )

// ---------------------------------------------------------------------------
// Skill result unwrapper — convert MCP content format to plain JSON
// ---------------------------------------------------------------------------

function unwrapSkillResult(result: CallToolResult): unknown {
  if (result.isError) {
    return {
      error:
        result.content[0]?.type === 'text'
          ? result.content[0].text
          : 'Unknown error',
    }
  }
  // Prefer structuredContent when available (native JSON object)
  if (result.structuredContent) {
    return result.structuredContent
  }
  // Fallback: single text content → parse as JSON object
  if (result.content.length === 1 && result.content[0].type === 'text') {
    try {
      return JSON.parse(result.content[0].text)
    } catch {
      return { text: result.content[0].text }
    }
  }
  // Image or mixed content → return as-is
  return result
}

// ---------------------------------------------------------------------------
// MCP helper — creates a fresh McpServer with all tools registered
// ---------------------------------------------------------------------------

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'tachibana',
    version: '0.1.0',
  })

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      },
      async (params: any) => tool.handler(params)
    )
  }

  return server
}

// ---------------------------------------------------------------------------
// MCP HTTP handler — Streamable HTTP transport (stateless, JSON response)
// ---------------------------------------------------------------------------

export async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse
) {
  // Only POST and DELETE are supported
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.writeHead(405, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Method not allowed' }))
    return
  }

  // Auth
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Missing bearer token' }))
    return
  }
  const valid = await verifyApiToken(authHeader.slice(7))
  if (!valid) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Invalid or expired token' }))
    return
  }

  // Stateless: create fresh transport + server per request.
  // enableJsonResponse ensures handleRequest blocks until tool execution
  // completes, instead of returning immediately with an SSE stream.
  const server = createMcpServer()
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  res.on('close', () => {
    server.close().catch(() => {})
  })

  await server.connect(transport)
  await transport.handleRequest(req, res)
}
