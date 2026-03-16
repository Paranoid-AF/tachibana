import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Command } from 'commander'
import mime from 'mime'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

function processResult(result: unknown): unknown {
  if (
    result === null ||
    typeof result !== 'object' ||
    !('content' in result) ||
    !Array.isArray((result as any).content)
  ) {
    return result
  }

  const content = (result as any).content.map((item: any) => {
    if (item.type !== 'image' || !item.data) return item

    const ext = mime.getExtension(item.mimeType ?? 'image/png') ?? 'bin'
    const filePath = join(tmpdir(), `tachibana-${randomUUID()}.${ext}`)
    writeFileSync(filePath, Buffer.from(item.data, 'base64'))
    return { type: 'image_file', path: filePath }
  })

  return { ...(result as object), content }
}

async function connect(origin: string, token: string) {
  const client = new Client({ name: 'tachibana-cli', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(
    new URL(`${origin}/api/agent/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } }
  )
  await client.connect(transport)
  return client
}

const program = new Command()
  .name('tachibana-cli')
  .description('MCP client for Tachibana iOS device control')
  .version('1.0.0')
  .option('--origin <url>', 'Tachibana server URL', process.env.TACHIBANA_ORIGIN)
  .option('--token <token>', 'Auth token', process.env.TACHIBANA_TOKEN)

program
  .command('list')
  .description('List available tools')
  .action(async () => {
    const { origin, token } = program.opts<{ origin: string; token: string }>()
    if (!origin || !token) {
      program.error('--origin and --token are required (or set TACHIBANA_ORIGIN / TACHIBANA_TOKEN)')
    }
    const client = await connect(origin, token)
    try {
      const { tools } = await client.listTools()
      for (const tool of tools) {
        console.log(tool.name)
        if (tool.description) console.log(`  ${tool.description}`)
      }
    } finally {
      await client.close()
    }
  })

program
  .command('call <tool_name> [json_params]')
  .description('Call a tool with JSON parameters')
  .action(async (toolName: string, paramsJson: string | undefined) => {
    const { origin, token } = program.opts<{ origin: string; token: string }>()
    if (!origin || !token) {
      program.error('--origin and --token are required (or set TACHIBANA_ORIGIN / TACHIBANA_TOKEN)')
    }

    let params: Record<string, unknown> = {}
    if (paramsJson) {
      try {
        params = JSON.parse(paramsJson)
      } catch {
        program.error('<json_params> must be valid JSON')
      }
    }

    const client = await connect(origin, token)
    try {
      const result = await client.callTool({ name: toolName, arguments: params })
      console.log(JSON.stringify(processResult(result)))
    } finally {
      await client.close()
    }
  })

program.parseAsync().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
