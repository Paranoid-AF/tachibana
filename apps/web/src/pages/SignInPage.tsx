import { useState } from 'react'
import { useLocation } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LuArrowRight, LuLock } from 'react-icons/lu'

import { AppLayout } from '@/components/AppLayout'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

async function startSignIn(email: string, password: string) {
  const res = await fetch('/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message ?? 'Sign in failed')
  return body as { loggedIn: true } | { requiresTwoFa: true; type: string }
}

async function submitTwoFa(code: string) {
  const res = await fetch('/api/auth/2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.message ?? '2FA failed')
  return body as { loggedIn: true }
}

export function SignInPage() {
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [twoFaCode, setTwoFaCode] = useState('')
  const [showTwoFa, setShowTwoFa] = useState(false)
  const [twoFaType, setTwoFaType] = useState('')
  const [error, setError] = useState('')

  const signinMutation = useMutation({
    mutationFn: () => startSignIn(email, password),
    onSuccess: (result) => {
      if ('requiresTwoFa' in result) {
        setTwoFaType(result.type)
        setShowTwoFa(true)
      } else {
        queryClient.invalidateQueries({ queryKey: ['auth/session'] })
        queryClient.invalidateQueries({ queryKey: ['devices'] })
        navigate('/')
      }
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  const twoFaMutation = useMutation({
    mutationFn: () => submitTwoFa(twoFaCode),
    onSuccess: () => {
      setShowTwoFa(false)
      queryClient.invalidateQueries({ queryKey: ['auth/session'] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      navigate('/')
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    signinMutation.mutate()
  }

  function handleTwoFa(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    twoFaMutation.mutate()
  }

  return (
    <AppLayout>
      {/* Sign-in content spans middle + right columns */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-border p-10 relative">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-8">
              Apple Account
            </div>

            <h1 className="text-3xl font-bold mb-3">Sign in with Apple Account</h1>
            <p className="text-sm text-muted-foreground mb-8">
              An Apple Account is required to manipulate this device.
            </p>

            <form onSubmit={handleSignIn}>
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 rounded-xl border border-input overflow-hidden divide-y divide-border">
                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-background outline-none placeholder:text-muted-foreground"
                    required
                    autoComplete="username"
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 text-sm bg-background outline-none placeholder:text-muted-foreground"
                    required
                    autoComplete="current-password"
                  />
                </div>
                <Button
                  type="submit"
                  size="icon"
                  className="h-auto w-14 rounded-xl flex-shrink-0"
                  disabled={signinMutation.isPending}
                >
                  <LuArrowRight className="w-5 h-5" />
                </Button>
              </div>

              {error && <p className="text-sm text-destructive mt-3">{error}</p>}
            </form>

            <p className="text-xs text-muted-foreground mt-4">
              Any account would work, it is not affiliated with iCloud or Find My.{' '}
              <a
                href="https://appleid.apple.com/account"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                Create a new one &raquo;
              </a>
            </p>

            <div className="flex items-start gap-2 mt-8 pt-8 border-t border-border">
              <LuLock className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Credentials are only shared with Apple and stored on your host device. You can sign
                out at any time to clear any stored information, including credentials.
              </p>
            </div>

            {/* 2FA dialog — overlays sign-in card with blur */}
            <Dialog open={showTwoFa} onOpenChange={(open) => !twoFaMutation.isPending && setShowTwoFa(open)}>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Two-factor authentication</DialogTitle>
                  <DialogDescription>
                    {twoFaType
                      ? `Enter the verification code sent via ${twoFaType}.`
                      : 'Enter your 6-digit verification code.'}
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleTwoFa} className="flex flex-col gap-4 mt-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full rounded-lg border border-input px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono bg-background outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                    required
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" disabled={twoFaMutation.isPending || twoFaCode.length < 6}>
                    {twoFaMutation.isPending ? 'Verifying...' : 'Verify'}
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
