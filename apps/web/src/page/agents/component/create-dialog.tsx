import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { createApiToken } from '@/api/admin-auth-api'
import { Button } from '@/component/ui/button'
import { Input } from '@/component/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/component/ui/dialog'
import { EXPIRATION_OPTIONS } from '@/api/agents-api'

interface CreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (result: { name: string; key: string }) => void
}

export function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateDialogProps) {
  const { t } = useTranslation()

  const [tokenName, setTokenName] = useState('')
  const [expiration, setExpiration] = useState(0)
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: () => {
      const expiresAt = expiration > 0 ? Date.now() + expiration : undefined
      return createApiToken(tokenName, expiresAt)
    },
    onSuccess: result => {
      onOpenChange(false)
      onCreated({ name: tokenName, key: result.key })
      setTokenName('')
      setExpiration(0)
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    createMutation.mutate()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!createMutation.isPending) {
          onOpenChange(next)
          if (!next) {
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
  )
}
