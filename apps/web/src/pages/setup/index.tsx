import { useState } from 'react'
import { useLocation } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'

import { adminSetup } from '@/lib/admin-auth-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function SetupPage() {
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => adminSetup(password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin/status'] })
      navigate('/', { replace: true })
    },
    onError: (err: Error) => {
      setError(err.message)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    mutation.mutate()
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-border p-10">
          <h1 className="text-3xl font-bold mb-3">Set up admin password</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Choose a password to protect your Tachibana instance.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="rounded-xl border border-input overflow-hidden divide-y divide-border">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="rounded-none border-0 shadow-none focus-visible:ring-0 px-4 py-3 h-auto"
                required
                autoComplete="new-password"
                autoFocus
              />
              <Input
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="rounded-none border-0 shadow-none focus-visible:ring-0 px-4 py-3 h-auto"
                required
                autoComplete="new-password"
              />
            </div>

            {error && <p className="text-sm text-destructive mt-3">{error}</p>}

            <div className="flex items-center justify-center mt-3">
              <Button
                type="submit"
                className="rounded-xl"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Setting up...' : 'Continue'}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
