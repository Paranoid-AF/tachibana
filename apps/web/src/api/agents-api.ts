import JSZip from 'jszip'
import Mustache from 'mustache'
import { milliseconds } from 'date-fns'

import { version } from '../../../../package.json'
import skillTemplate from '../../assets/snippets/agents/skill.md.mustache?raw'
import mcpTemplate from '../../assets/snippets/agents/mcp.json.mustache?raw'

export const AGENT_SKILL_NAME = 'idevice'

export const EXPIRATION_OPTIONS = [
  { labelKey: 'agents.createDialog.expirationNever', value: 0 },
  {
    labelKey: 'agents.createDialog.expiration7days',
    value: milliseconds({ days: 7 }),
  },
  {
    labelKey: 'agents.createDialog.expiration30days',
    value: milliseconds({ days: 30 }),
  },
  {
    labelKey: 'agents.createDialog.expiration90days',
    value: milliseconds({ days: 90 }),
  },
]

export async function fetchToolsDocs(): Promise<string> {
  const resp = await fetch('/api/agent/tools-docs')
  const data = (await resp.json()) as { markdown: string }
  return data.markdown
}

export async function fetchCliBinary(): Promise<{
  name: string
  data: ArrayBuffer
} | null> {
  try {
    const resp = await fetch('/api/agent/mcp-client')
    if (!resp.ok) return null
    const disposition = resp.headers.get('Content-Disposition') ?? ''
    const match = disposition.match(/filename="([^"]+)"/)
    const name = match?.[1] ?? 'tachibana-cli'
    const data = await resp.arrayBuffer()
    return { name, data }
  } catch {
    return null
  }
}

export function renderTemplates(
  authToken: string,
  toolsDocs: string,
  cliExecutableName: string
) {
  const vars = {
    server_origin: window.location.origin,
    auth_token: authToken,
    skill_name: AGENT_SKILL_NAME,
    tools_docs: toolsDocs,
    cli_executable_name: cliExecutableName,
  }
  return {
    skillMd: Mustache.render(skillTemplate, vars),
    mcpJson: Mustache.render(mcpTemplate, vars),
  }
}

export async function downloadSkillZip(authToken: string, toolsDocs: string) {
  const safeName = `${AGENT_SKILL_NAME}-${version}`
  const zip = new JSZip()

  const cli = await fetchCliBinary()
  const cliExecutableName = cli?.name ?? 'tachibana-cli'

  const { skillMd } = renderTemplates(authToken, toolsDocs, cliExecutableName)
  zip.file(`${safeName}/SKILL.md`, skillMd)

  if (cli) {
    zip.file(`${safeName}/${cli.name}`, cli.data, { binary: true })
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
