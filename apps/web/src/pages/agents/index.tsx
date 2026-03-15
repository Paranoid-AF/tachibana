import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow, milliseconds } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { useDateLocale } from '@/hooks/use-date-locale'
import {
  Copy,
  Download,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
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

import { version } from '../../../../../package.json'
import skillTemplate from '../../../assets/snippets/agents/skill.md.mustache?raw'
import mcpTemplate from '../../../assets/snippets/agents/mcp.json.mustache?raw'
import agentSkillsLogo from '../../../assets/images/agents/agentskills-logo.png'
import mcpLogo from '../../../assets/images/agents/mcp-logo.svg'

const AGENT_SKILL_NAME = 'idevice'

const EXPIRATION_OPTIONS = [
  { labelKey: 'agents.createDialog.expirationNever', value: 0 },
  { labelKey: 'agents.createDialog.expiration7days', value: milliseconds({ days: 7 }) },
  { labelKey: 'agents.createDialog.expiration30days', value: milliseconds({ days: 30 }) },
  { labelKey: 'agents.createDialog.expiration90days', value: milliseconds({ days: 90 }) },
]

function useFormatDate() {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  return {
    formatDate(ms: number | null): string {
      if (!ms) return t('agents.never')
      return format(ms, 'MMM d, yyyy', { locale: dateLocale })
    },
    formatRelativeDate(ms: number | null): string {
      if (!ms) return t('agents.never')
      return formatDistanceToNow(ms, { addSuffix: true, locale: dateLocale })
    },
  }
}

async function fetchToolsDocs(): Promise<string> {
  const resp = await fetch('/api/agent/tools-docs')
  const data = (await resp.json()) as { markdown: string }
  return data.markdown
}

function renderTemplates(authToken: string, toolsDocs: string) {
  const vars = {
    server_origin: window.location.origin,
    auth_token: authToken,
    skill_name: AGENT_SKILL_NAME,
    tools_docs: toolsDocs,
  }
  return {
    skillMd: Mustache.render(skillTemplate, vars),
    mcpJson: Mustache.render(mcpTemplate, vars),
  }
}

async function downloadSkillZip(skillMdContent: string) {
  const safeName = `${AGENT_SKILL_NAME}-${version}`
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
  const { t } = useTranslation()
  const { formatDate, formatRelativeDate } = useFormatDate()
  const queryClient = useQueryClient()

  const { data: tokens = [] } = useQuery<TokenRow[]>({
    queryKey: ['api-tokens'],
    queryFn: fetchApiTokens,
  })

  const { data: toolsDocs = '' } = useQuery<string>({
    queryKey: ['tools-docs'],
    queryFn: fetchToolsDocs,
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
    ? renderTemplates(revealedAgent.key, toolsDocs)
    : null

  return (
    <AppLayout>
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold">{t('agents.title')}</h1>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              {t('agents.register')}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            {t('agents.description')}
          </p>

          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t('agents.noAgents')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('agents.agentName')}</TableHead>
                  <TableHead>{t('agents.expires')}</TableHead>
                  <TableHead>{t('agents.lastUsed')}</TableHead>
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
                            {t('agents.rename')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => deleteMutation.mutate(token.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('agents.delete')}
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
                <DialogTitle>{t('agents.renameDialog.title')}</DialogTitle>
                <DialogDescription>
                  {t('agents.renameDialog.description')}
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
                  placeholder={t('agents.renameDialog.placeholder')}
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
                    {renameMutation.isPending
                      ? t('agents.renameDialog.saving')
                      : t('agents.renameDialog.save')}
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
                <DialogTitle>{t('agents.createDialog.title')}</DialogTitle>
                <DialogDescription>
                  {t('agents.createDialog.description')}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreate} className="flex flex-col gap-4">
                <Input
                  placeholder={t('agents.createDialog.placeholder')}
                  value={tokenName}
                  onChange={e => setTokenName(e.target.value)}
                  required
                  autoFocus
                />

                <div>
                  <label className="text-sm font-medium mb-1.5 block">
                    {t('agents.createDialog.expiration')}
                  </label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    value={expiration}
                    onChange={e => setExpiration(Number(e.target.value))}
                  >
                    {EXPIRATION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <DialogFooter>
                  <Button type="submit" disabled={createMutation.isPending}>
                    {createMutation.isPending
                      ? t('agents.createDialog.registering')
                      : t('agents.createDialog.register')}
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
                <DialogTitle>{t('agents.setupDialog.title')}</DialogTitle>
                <DialogDescription>
                  {t('agents.setupDialog.description')}
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
                    <span className="font-semibold">
                      {t('agents.setupDialog.agentSkill')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('agents.setupDialog.agentSkillDescription')}
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() =>
                      revealedAgent &&
                      rendered &&
                      downloadSkillZip(rendered.skillMd)
                    }
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {t('agents.setupDialog.downloadZip')}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {t('agents.setupDialog.agentSkillHint')}
                  </p>
                </div>

                {/* MCP column */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <img src={mcpLogo} alt="MCP" className="w-6 h-6" />
                    <span className="font-semibold">
                      {t('agents.setupDialog.mcp')}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('agents.setupDialog.mcpDescription')}
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
                        rendered && copyToClipboard(rendered.mcpJson, 'mcp')
                      }
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {copiedItem === 'mcp' && (
                    <p className="text-xs text-muted-foreground">
                      {t('agents.setupDialog.copied')}
                    </p>
                  )}
                </div>
              </div>

              {/* Raw token section */}
              <div className="border-t pt-4 mt-2">
                <p className="text-sm text-muted-foreground mb-2">
                  {t('agents.setupDialog.saveToken')}
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
                    {t('agents.setupDialog.copied')}
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
