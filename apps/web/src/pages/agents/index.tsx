import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import JSZip from 'jszip'
import Mustache from 'mustache'

import {
  fetchApiTokens,
  createApiToken,
  renameApiToken,
  deleteApiToken,
  type TokenRow,
} from '@/lib/admin-auth-api'
import { AppLayout } from '@/components/biz/app-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table'

import skillTemplate from '../../../assets/snippets/agents/skill.md.mustache?raw'
import mcpTemplate from '../../../assets/snippets/agents/mcp.json.mustache?raw'
import agentSkillsLogo from '../../../assets/images/agents/agentskills-logo.png'
import mcpLogo from '../../../assets/images/agents/mcp-logo.svg'

const EXPIRATION_OPTIONS = [
  { label: 'Never', value: 0 },
  { label: '7 days', value: 7 * 24 * 60 * 60 * 1000 },
  { label: '30 days', value: 30 * 24 * 60 * 60 * 1000 },
  { label: '90 days', value: 90 * 24 * 60 * 60 * 1000 },
]

function formatDate(ms: number | null): string {
  if (!ms) return 'Never'
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatRelativeDate(ms: number | null): string {
  if (!ms) return 'Never'
  const now = Date.now()
  const diff = now - ms
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return formatDate(ms)
}

function renderTemplates(authToken: string) {
  const vars = {
    server_origin: window.location.origin,
    auth_token: authToken,
  }
  return {
    skillMd: Mustache.render(skillTemplate, vars),
    mcpJson: Mustache.render(mcpTemplate, vars),
  }
}

async function downloadSkillZip(agentName: string, skillMdContent: string) {
  const safeName = `tachibana-${agentName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-1.0.0`
  const zip = new JSZip()
  zip.file(`${safeName}/SKILL.md`, skillMdContent)
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

export function AgentsPage() {
  const queryClient = useQueryClient()

  const { data: tokens = [] } = useQuery<TokenRow[]>({
    queryKey: ['api-tokens'],
    queryFn: fetchApiTokens,
  })

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [expiration, setExpiration] = useState(0)
  const [error, setError] = useState('')

  // Rename dialog state
  const [renameToken, setRenameToken] = useState<TokenRow | null>(null)
  const [renameName, setRenameName] = useState('')

  // Setup guide dialog state
  const [revealedAgent, setRevealedAgent] = useState<{
    name: string
    key: string
  } | null>(null)
  const [copiedItem, setCopiedItem] = useState<'mcp' | 'token' | null>(null)

  const createMutation = useMutation({
    mutationFn: () => {
      const expiresAt = expiration > 0 ? Date.now() + expiration : undefined
      return createApiToken(tokenName, expiresAt)
    },
    onSuccess: result => {
      setCreateOpen(false)
      setRevealedAgent({ name: tokenName, key: result.key })
      setTokenName('')
      setExpiration(0)
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renameApiToken(id, name),
    onSuccess: () => {
      setRenameToken(null)
      setRenameName('')
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteApiToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-tokens'] })
    },
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    createMutation.mutate()
  }

  async function copyToClipboard(text: string, item: 'mcp' | 'token') {
    await navigator.clipboard.writeText(text)
    setCopiedItem(item)
  }

  const rendered = revealedAgent
    ? renderTemplates(revealedAgent.key)
    : null

  return (
    <AppLayout>
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold">MCP &amp; Skills</h1>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Register
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Enable access for your favorite LLM agents.
          </p>

          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No agent yet. Register one to get started.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent Name</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map(token => (
                  <TableRow key={token.id}>
                    <TableCell>
                      <div className="font-medium">{token.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {token.keyPrefix}...
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(token.expiresAt)}</TableCell>
                    <TableCell>
                      {formatRelativeDate(token.lastUsedAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameToken(token)
                              setRenameName(token.name ?? '')
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteMutation.mutate(token.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Rename token dialog */}
          <Dialog
            open={!!renameToken}
            onOpenChange={open => {
              if (!renameMutation.isPending && !open) {
                setRenameToken(null)
                setRenameName('')
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Rename agent</DialogTitle>
                <DialogDescription>
                  Enter a new name for this agent.
                </DialogDescription>
              </DialogHeader>

              <form
                onSubmit={e => {
                  e.preventDefault()
                  if (renameToken) {
                    renameMutation.mutate({
                      id: renameToken.id,
                      name: renameName,
                    })
                  }
                }}
                className="flex flex-col gap-4"
              >
                <Input
                  placeholder="Token name"
                  value={renameName}
                  onChange={e => setRenameName(e.target.value)}
                  required
                  autoFocus
                />
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={
                      renameMutation.isPending ||
                      renameName === renameToken?.name
                    }
                  >
                    {renameMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Create token dialog */}
          <Dialog
            open={createOpen}
            onOpenChange={open => {
              if (!createMutation.isPending) {
                setCreateOpen(open)
                if (!open) {
                  setTokenName('')
                  setExpiration(0)
                  setError('')
                }
              }
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Register your agent</DialogTitle>
                <DialogDescription>
                  Next, you will be taken to setup your agent.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <Input
                  placeholder="Agent name"
                  value={tokenName}
                  onChange={e => setTokenName(e.target.value)}
                  required
                  autoFocus
                />

                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    Expiration
                  </label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={expiration}
                    onChange={e => setExpiration(Number(e.target.value))}
                  >
                    {EXPIRATION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Registering...' : 'Register'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Setup guide dialog */}
          <Dialog
            open={!!revealedAgent}
            onOpenChange={open => {
              if (!open) {
                setRevealedAgent(null)
                setCopiedItem(null)
              }
            }}
          >
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Setup your agent</DialogTitle>
                <DialogDescription>
                  This window includes your secret key &mdash; it will only be
                  shown once.
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-6">
                {/* AgentSkill column */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <img
                      src={agentSkillsLogo}
                      alt="AgentSkills"
                      className="w-6 h-6"
                    />
                    <span className="font-semibold">AgentSkill</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Download a ZIP containing a SKILL.md file with connection
                    info and API reference for your agent.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      revealedAgent &&
                      rendered &&
                      downloadSkillZip(revealedAgent.name, rendered.skillMd)
                    }
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download ZIP
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Place this file in your agent&apos;s working directory.
                  </p>
                </div>

                {/* MCP column */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <img src={mcpLogo} alt="MCP" className="w-6 h-6" />
                    <span className="font-semibold">MCP</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Add this JSON snippet to your MCP client configuration.
                  </p>
                  <div className="relative">
                    <pre className="rounded-md bg-muted px-3 py-2 text-xs font-mono overflow-x-auto whitespace-pre">
                      {rendered?.mcpJson}
                    </pre>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-1 right-1 h-7 w-7"
                      onClick={() =>
                        rendered &&
                        copyToClipboard(rendered.mcpJson, 'mcp')
                      }
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {copiedItem === 'mcp' && (
                    <p className="text-xs text-muted-foreground">
                      Copied to clipboard
                    </p>
                  )}
                </div>
              </div>

              {/* Raw token section */}
              <div className="border-t pt-4 mt-2">
                <p className="text-sm text-muted-foreground mb-2">
                  Or save the token for later...
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
                    {revealedAgent?.key}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() =>
                      revealedAgent &&
                      copyToClipboard(revealedAgent.key, 'token')
                    }
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
                {copiedItem === 'token' && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Copied to clipboard
                  </p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AppLayout>
  )
}
