import { useLocation } from 'wouter'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LuEllipsis } from 'react-icons/lu'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

async function fetchSessionInfo(): Promise<{ loggedIn: boolean; email?: string }> {
  const res = await fetch('/api/auth/session')
  if (!res.ok) throw new Error('Failed to fetch session')
  return res.json()
}

async function signOut() {
  const res = await fetch('/api/auth/signout', { method: 'POST' })
  if (!res.ok) throw new Error('Failed to sign out')
  return res.json()
}

export function AccountPanel() {
  const [, navigate] = useLocation()
  const queryClient = useQueryClient()

  const { data: sessionInfo } = useQuery({
    queryKey: ['auth/session'],
    queryFn: fetchSessionInfo,
    refetchInterval: 5000,
  })

  const signOutMutation = useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth/session'] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })

  if (!sessionInfo?.loggedIn) {
    return (
      <div className="rounded-xl border border-border p-3">
        <div className="text-xs font-medium uppercase tracking-wide text-foreground mb-2">
          Apple Account
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => navigate('/signin')}
        >
          Sign in
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-medium uppercase tracking-wide text-foreground">
          Apple Account
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5">
              <LuEllipsis className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => signOutMutation.mutate()}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="text-xs text-muted-foreground">Signed in as</div>
      <div className="text-sm font-medium truncate">{sessionInfo.email}</div>
    </div>
  )
}
