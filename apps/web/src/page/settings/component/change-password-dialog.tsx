import { useState } from 'react'
import { useLocation } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { adminChangePassword } from '@/api/admin-auth-api'
import { translateError } from '@/lib/i18n'
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

interface ChangePasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const { t } = useTranslation()
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => adminChangePassword(currentPassword, newPassword),
    onSuccess: () => {
      onOpenChange(false)
      queryClient.setQueryData(['admin/status'], {
        passwordSet: true,
        loggedIn: false,
      })
      navigate('/login', { replace: true })
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword.length < 8) {
      setError(t('settings.password.newPasswordMinLength'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('settings.password.passwordsMismatch'))
      return
    }

    mutation.mutate()
  }

  function handleOpenChange(next: boolean) {
    if (!mutation.isPending) {
      onOpenChange(next)
      if (!next) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setError('')
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.password.dialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('settings.password.dialogDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            type="password"
            placeholder={t('settings.password.currentPassword')}
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Input
            type="password"
            placeholder={t('settings.password.newPassword')}
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
          <Input
            type="password"
            placeholder={t('settings.password.confirmNewPassword')}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />

          {error && (
            <p className="text-sm text-destructive">{translateError(error)}</p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? t('settings.password.changing')
                : t('settings.password.changePassword')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
