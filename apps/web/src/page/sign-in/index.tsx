import { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useSession } from '@/hook/use-session'

import { AppLayout } from '@/component/biz/app-layout'
import { Button } from '@/component/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/component/ui/dialog'
import { Input } from '@/component/ui/input'
import { startSignIn, submitTwoFa } from '@/api/auth-api'

export function SignInPage() {
  const { t } = useTranslation()
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()

  const { data: sessionInfo, isLoading } = useSession()

  useEffect(() => {
    if (!isLoading && sessionInfo?.loggedIn) {
      navigate('/', { replace: true })
    }
  }, [isLoading, sessionInfo, navigate])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFaCode, setTwoFaCode] = useState('')
  const [showTwoFa, setShowTwoFa] = useState(false)
  const [twoFaType, setTwoFaType] = useState('')
  const [signinError, setSigninError] = useState('')
  const [twoFaError, setTwoFaError] = useState('')

  const signinMutation = useMutation({
    mutationFn: () => startSignIn(email, password),
    onSuccess: result => {
      if ('requiresTwoFa' in result) {
        setTwoFaType(result.type)
        setShowTwoFa(true)
      } else {
        queryClient.invalidateQueries({ queryKey: ['apple-account/session'] })
        queryClient.invalidateQueries({ queryKey: ['devices'] })
        navigate('/')
      }
    },
    onError: (err: Error) => {
      setSigninError(err.message)
    },
  })

  const twoFaMutation = useMutation({
    mutationFn: () => submitTwoFa(twoFaCode),
    onSuccess: () => {
      setShowTwoFa(false)
      queryClient.invalidateQueries({ queryKey: ['apple-account/session'] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      navigate('/')
    },
    onError: (err: Error) => {
      setTwoFaError(err.message)
      setTwoFaCode('')
    },
  })

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setSigninError('')
    signinMutation.mutate()
  }

  function handleTwoFa(e: React.FormEvent) {
    e.preventDefault()
    setTwoFaError('')
    twoFaMutation.mutate()
  }

  return (
    <AppLayout>
      {/* Sign-in content spans middle + right columns */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-border p-10 relative">
            <h1 className="text-3xl font-bold mb-3">{t('signIn.title')}</h1>
            <p className="text-sm text-muted-foreground mb-8">
              {t('signIn.description')}
            </p>

            <form onSubmit={handleSignIn}>
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 rounded-xl border border-input overflow-hidden divide-y divide-border">
                  <Input
                    type="email"
                    placeholder={t('signIn.email')}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="rounded-none border-0 shadow-none focus-visible:ring-0 px-4 py-3 h-auto"
                    required
                    autoComplete="username"
                  />
                  <Input
                    type="password"
                    placeholder={t('common.password')}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="rounded-none border-0 shadow-none focus-visible:ring-0 px-4 py-3 h-auto"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              {signinError && (
                <p className="text-sm text-destructive mt-3">{signinError}</p>
              )}

              <div className="flex align-center justify-center mt-3">
                <Button
                  type="submit"
                  className="rounded-xl shrink-0"
                  disabled={signinMutation.isPending}
                >
                  {signinMutation.isPending
                    ? t('signIn.signingIn')
                    : t('signIn.submit')}
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </div>
            </form>

            <p className="text-xs text-muted-foreground mt-12">
              {t('signIn.accountNote')}
            </p>
            <a
              href="https://account.apple.com/account"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline-offset-4 hover:underline text-xs"
            >
              {t('signIn.createAccount')}
            </a>

            <div className="flex items-start gap-2 mt-8 pt-8 border-t border-border">
              <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                {t('signIn.privacyNote')}
              </p>
            </div>

            {/* 2FA dialog — overlays sign-in card with blur */}
            <Dialog
              open={showTwoFa}
              onOpenChange={open => {
                if (!twoFaMutation.isPending) {
                  setShowTwoFa(open)
                  if (!open) setTwoFaError('')
                }
              }}
            >
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>{t('signIn.twoFa.title')}</DialogTitle>
                  <DialogDescription>
                    {twoFaType
                      ? t('signIn.twoFa.descriptionWithType', {
                          type: twoFaType,
                        })
                      : t('signIn.twoFa.description')}
                  </DialogDescription>
                </DialogHeader>

                <form
                  onSubmit={handleTwoFa}
                  className="flex flex-col gap-4 mt-2"
                >
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={twoFaCode}
                    onChange={e =>
                      setTwoFaCode(e.target.value.replace(/\D/g, ''))
                    }
                    className="text-center text-2xl tracking-[0.5em] font-mono h-auto py-3"
                    autoFocus
                    required
                  />
                  {twoFaError && (
                    <p className="text-sm text-destructive">{twoFaError}</p>
                  )}
                  <Button
                    type="submit"
                    disabled={twoFaMutation.isPending || twoFaCode.length < 6}
                  >
                    {twoFaMutation.isPending
                      ? t('signIn.twoFa.verifying')
                      : t('signIn.twoFa.verify')}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
