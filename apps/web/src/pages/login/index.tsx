import { useState } from 'react'
import { useLocation } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'

import { adminLogin } from '@/lib/admin-auth-api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function LoginPage() {
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => adminLogin(password),
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
    mutation.mutate()
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-8">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl border border-border p-10">
          <h1 className="text-3xl font-bold mb-3">Welcome back</h1>
          <p className="text-sm text-muted-foreground mb-8">
            Enter your admin password to continue.
          </p>

          <form onSubmit={handleSubmit}>
            <div className="rounded-xl border border-input overflow-hidden">
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="rounded-none border-0 shadow-none focus-visible:ring-0 px-4 py-3 h-auto"
                required
                autoComplete="current-password"
                autoFocus
              />
            </div>

            {error && <p className="text-sm text-destructive mt-3">{error}</p>}

            <div className="flex items-center justify-center mt-3">
              <Button
                type="submit"
                className="rounded-xl"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? 'Logging in...' : 'Login'}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
