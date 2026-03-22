import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { renameApiToken, type TokenRow } from '@/lib/admin-auth-api'
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

interface RenameDialogProps {
  token: TokenRow | null
  onClose: () => void
  onRenamed: () => void
}

export function RenameDialog({ token, onClose, onRenamed }: RenameDialogProps) {
  const { t } = useTranslation()

  const [renameName, setRenameName] = useState('')

  useEffect(() => {
    if (token) setRenameName(token.name ?? '')
  }, [token])

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renameApiToken(id, name),
    onSuccess: () => {
      onClose()
      setRenameName('')
      onRenamed()
    },
  })

  return (
    <Dialog
      open={!!token}
      onOpenChange={open => {
        if (!renameMutation.isPending && !open) {
          onClose()
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
            if (token) {
              renameMutation.mutate({
                id: token.id,
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
              disabled={renameMutation.isPending || renameName === token?.name}
            >
              {renameMutation.isPending
                ? t('agents.renameDialog.saving')
                : t('agents.renameDialog.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
