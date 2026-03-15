import { useLocation } from 'wouter'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ellipsis } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/components/ui/spinner'

import { useSession } from '@/hooks/use-session'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

async function signOut() {
  const res = await fetch('/api/apple-account/signout', { method: 'POST' })
  if (!res.ok) throw new Error('Failed to sign out')
  return res.json()
}

export function AccountPanel() {
  const { t } = useTranslation()
  const [location, navigate] = useLocation()
  const queryClient = useQueryClient()

  const { data: sessionInfo, isLoading } = useSession()

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apple-account/session'] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border p-3 flex justify-center py-4">
        <Spinner className="text-muted-foreground" />
      </div>
    )
  }

  if (!sessionInfo?.loggedIn) {
    if (location === '/signin') return null

    return (
      <div className="rounded-xl border border-border p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-foreground mb-2">
          {t('account.appleAccount')}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => navigate('/signin')}
        >
          {t('common.signIn')}
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium uppercase tracking-wide text-foreground">
          {t('account.appleAccount')}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5">
              <Ellipsis className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => signOutMutation.mutate()}
            >
              {t('account.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="text-xs text-muted-foreground">{t('account.signedInAs')}</div>
      <div className="text-sm font-medium truncate">{sessionInfo.email}</div>
    </div>
  )
}
