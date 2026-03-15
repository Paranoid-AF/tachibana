import type { IncomingMessage, ServerResponse } from 'node:http'

import { Elysia, t } from 'elysia'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { apiTokenGuard } from '../libs/auth-middleware.ts'
import { verifyApiToken } from '../libs/admin-auth.ts'
import { logDeviceAction } from '../libs/audit-log.ts'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { allTools, toolMap } from '../libs/agent-tools.ts'
import { generateToolsMarkdown } from '../libs/agent-tools-docs.ts'

// Cache generated markdown at startup (tools are static)
const toolsDocsMarkdown = generateToolsMarkdown()

// ---------------------------------------------------------------------------
// Skill route (Elysia)
// ---------------------------------------------------------------------------

export const agentRoutes = new Elysia({ prefix: '/agent' })
  // Public endpoint — tool list is not sensitive
  .get('/tools-docs', () => ({ markdown: toolsDocsMarkdown }))
  .use(apiTokenGuard)
  .post(
    '/skill',
    async ctx => {
      const { body, set } = ctx
      const apiAuthId = (ctx as any).apiAuthId as number | null
      const { tool, parameters } = body
      const def = toolMap.get(tool)
      if (!def) {
        set.status = 400
        return { error: `Unknown tool: ${tool}` }
      }
      try {
        const parsed = def.inputSchema.parse(parameters ?? {})
        if (parsed.udid) {
          const result = await logDeviceAction({
            udid: parsed.udid as string,
            authId: apiAuthId,
            source: 'agent',
            action: tool,
            params: parsed as Record<string, unknown>,
            work: () => def.handler(parsed),
          })
          return unwrapSkillResult(result)
        }
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

function createMcpServer(authId: number | null): McpServer {
  const server = new McpServer(
    {
      name: 'tachibana',
      version: '0.1.0',
    },
    {
      instructions: [
        'Coordinate verification workflow: before tapping, double-tapping, long-pressing, or dragging on the device screen, you MUST:',
        '1. Call get_device_control_size to learn the valid coordinate range.',
        '2. Call mark_coordinates with your intended coordinates to visually verify they hit the correct target.',
        '   Each returned image has a full-screen crosshair: a horizontal line spanning the full width and a vertical line spanning the full height. The point where these two lines INTERSECT is the EXACT coordinate. A numbered badge sits at the intersection. Look ONLY at the intersection point to confirm it lands on the intended UI element.',
        '3. Only after confirming the crosshair markers are positioned correctly, perform the action (tap, double_tap, touch_and_hold, drag).',
        'Skipping this workflow risks tapping the wrong element. Never guess coordinates without verifying them first.',
      ].join('\n'),
    }
  )

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      },
      async (params: any) => {
        if (params.udid) {
          return logDeviceAction({
            udid: params.udid as string,
            authId,
            source: 'mcp',
            action: tool.name,
            params: params as Record<string, unknown>,
            work: () => tool.handler(params),
          })
        }
        return tool.handler(params)
      }
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
  const authResult = await verifyApiToken(authHeader.slice(7))
  if (!authResult.valid) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'Invalid or expired token' }))
    return
  }

  // Stateless: create fresh transport + server per request.
  // enableJsonResponse ensures handleRequest blocks until tool execution
  // completes, instead of returning immediately with an SSE stream.
  const server = createMcpServer(authResult.authId ?? null)
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
