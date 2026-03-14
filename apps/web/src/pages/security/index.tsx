import { useState } from 'react'
import { useLocation } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { adminChangePassword } from '@/lib/admin-auth-api'
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

export function SecurityPage() {
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
      queryClient.setQueryData(['admin/status'], { passwordSet: true, loggedIn: false })
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
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
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

  return (
    <AppLayout>
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-bold mb-2">Admin Password</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Reset your admin password. This will log you out of other sessions.
            MCP &amp; Skills Clients are kept intact.
          </p>

          <Button onClick={() => setOpen(true)}>Change</Button>

          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Change admin password</DialogTitle>
                <DialogDescription>
                  All existing sessions will be invalidated.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                  type="password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <Input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />

                {error && <p className="text-sm text-destructive">{error}</p>}

                <DialogFooter>
                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Changing...' : 'Change password'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </AppLayout>
  )
}
