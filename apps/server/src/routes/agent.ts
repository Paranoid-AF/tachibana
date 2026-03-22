import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

import { Elysia } from 'elysia'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { verifyApiToken } from '../services/auth/admin.ts'
import { logDeviceAction } from '../services/audit-log.ts'
import { allTools } from '../services/agent-tools/index.ts'
import { generateToolsMarkdown } from '../services/agent-tools/docs.ts'
import { serverDir, isCompiled } from '../libs/runtime.ts'

// Cache generated markdown at startup (tools are static)
const toolsDocsMarkdown = generateToolsMarkdown()

// ---------------------------------------------------------------------------
// Skill route (Elysia)
// ---------------------------------------------------------------------------

const cliExecutableName = 'tachibana-cli.js'

/** Resolve the CLI binary from staging dir (production) or apps/cli/dist/ (dev). */
function resolveCliBinaryPath(): string {
  if (isCompiled) {
    // Production: CLI binary sits next to the server binary in the staging dir
    return path.join(serverDir, cliExecutableName)
  }
  // Dev: apps/server → apps/cli/dist/
  return path.join(serverDir, '..', 'cli', 'dist', cliExecutableName)
}

export const agentRoutes = new Elysia({ prefix: '/agent' })
  // Public endpoint — tool list is not sensitive
  .get('/tools-docs', () => ({ markdown: toolsDocsMarkdown }))
  // Public endpoint — serve the CLI binary for inclusion in SKILL ZIP
  .get('/mcp-client', async ({ set }) => {
    const binaryPath = resolveCliBinaryPath()
    const file = Bun.file(binaryPath)
    if (!(await file.exists())) {
      set.status = 404
      return { error: 'CLI binary not found' }
    }
    set.headers['Content-Disposition'] =
      `attachment; filename="${cliExecutableName}"`
    set.headers['Content-Type'] = 'text/javascript'
    return file
  })

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
        'Two-step device control workflow: coordinate-based tools (tap, double_tap, touch_and_hold, drag) only PREVIEW the action. You MUST:',
        '1. Call get_device_control_size to learn the valid coordinate range.',
        '2. Call the action tool (tap, double_tap, touch_and_hold, drag) with your intended coordinates.',
        '   This returns annotated screenshots with crosshairs and a device_control_token. Each image has a full-screen crosshair whose intersection is the EXACT coordinate. Verify the intersection lands on the intended UI element.',
        '3. If the crosshair is correct, call execute_device_control with the device_control_token to perform the action.',
        '   If the crosshair is wrong, call the action tool again with adjusted coordinates instead.',
        'Each token is single-use. Skipping verification risks acting on the wrong element.',
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
