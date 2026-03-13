import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'

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

  // Key reveal dialog state
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const createMutation = useMutation({
    mutationFn: () => {
      const expiresAt = expiration > 0 ? Date.now() + expiration : undefined
      return createApiToken(tokenName, expiresAt)
    },
    onSuccess: result => {
      setCreateOpen(false)
      setTokenName('')
      setExpiration(0)
      setRevealedKey(result.key)
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

  async function copyKey() {
    if (!revealedKey) return
    await navigator.clipboard.writeText(revealedKey)
    setCopied(true)
  }

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

          {/* Key reveal dialog */}
          <Dialog
            open={!!revealedKey}
            onOpenChange={open => {
              if (!open) {
                setRevealedKey(null)
                setCopied(false)
              }
            }}
          >
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Your new access token</DialogTitle>
                <DialogDescription>
                  This key will only be shown once. Copy it now.
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs font-mono break-all">
                  {revealedKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyKey}
                  className="shrink-0"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              {copied && (
                <p className="text-sm text-muted-foreground">
                  Copied to clipboard
                </p>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AppLayout>
  )
}
