import { useState } from 'react'
import { useLocation } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { adminChangePassword } from '@/lib/admin-auth-api'
import { translateError } from '@/lib/i18n'
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

const LANGUAGES = [
  { code: 'en-US', label: 'English' },
  { code: 'zh-CN', label: '简体中文' },
] as const

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()

  const [open, setOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => adminChangePassword(currentPassword, newPassword),
    onSuccess: () => {
      setOpen(false)
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
      setOpen(next)
      if (!next) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setError('')
      }
    }
  }

  const currentLangLabel =
    LANGUAGES.find(l => l.code === i18n.language)?.label ?? 'English'

  return (
    <AppLayout>
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold mb-2">
            {t('settings.password.title')}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {t('settings.password.description')}
          </p>

          <Button onClick={() => setOpen(true)}>
            {t('settings.password.change')}
          </Button>

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
                  <p className="text-sm text-destructive">
                    {translateError(error)}
                  </p>
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

          {/* Language section */}
          <div className="mt-10">
            <h2 className="text-2xl font-bold mb-2">
              {t('settings.language.title')}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {t('settings.language.description')}
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-56 justify-between">
                  {currentLangLabel}
                  <span className="text-muted-foreground">&#9662;</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                {LANGUAGES.map(lang => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => i18n.changeLanguage(lang.code)}
                    className={
                      i18n.language === lang.code ? 'font-semibold' : ''
                    }
                  >
                    {lang.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
