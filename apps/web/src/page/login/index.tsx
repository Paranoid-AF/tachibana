import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { adminLogin } from '@/api/admin-auth-api'
import { translateError } from '@/lib/i18n'
import { useAdminAuth } from '@/hook/use-admin-auth'
import { Button } from '@/component/ui/button'
import { Input } from '@/component/ui/input'
import { Spinner } from '@/component/ui/spinner'
import { LanguageSwitcher } from '@/component/biz/language-switcher'

export function LoginPage() {
  const { t } = useTranslation()
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()

  const { data: authStatus, isLoading: authLoading } = useAdminAuth()

  useEffect(() => {
    if (authLoading || !authStatus) return
    if (!authStatus.passwordSet) {
      navigate('/setup', { replace: true })
    } else if (authStatus.loggedIn) {
      navigate('/', { replace: true })
    }
  }, [authLoading, authStatus, navigate])

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => adminLogin(password),
    onSuccess: () => {
      queryClient.setQueryData(['admin/status'], {
        passwordSet: true,
        loggedIn: true,
      })
      navigate('/', { replace: true })
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    mutation.mutate()
  }

  if (authLoading || !authStatus?.passwordSet || authStatus?.loggedIn) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-8 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-border p-10">
          <h1 className="text-3xl font-bold mb-3">{t('login.title')}</h1>
          <p className="text-sm text-muted-foreground mb-8">
            {t('login.description')}
          </p>

          <form onSubmit={handleSubmit}>
            <div className="rounded-xl border border-input overflow-hidden">
              <Input
                type="password"
                placeholder={t('common.password')}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="rounded-none border-0 shadow-none focus-visible:ring-0 px-4 py-3 h-auto"
                required
                autoComplete="current-password"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-destructive mt-3">
                {translateError(error)}
              </p>
            )}

            <div className="flex items-center justify-center mt-3">
              <Button
                type="submit"
                className="rounded-xl"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? t('login.loggingIn') : t('login.submit')}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
