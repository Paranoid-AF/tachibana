import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'wouter'

import { useAdminAuth } from '@/hook/use-admin-auth'
import { Spinner } from '@/component/ui/spinner'

interface AuthGateProps {
  children: ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const [, navigate] = useLocation()
  const { data, isLoading } = useAdminAuth()

  useEffect(() => {
    if (isLoading || !data) return

    if (!data.passwordSet) {
      navigate('/setup', { replace: true })
    } else if (!data.loggedIn) {
      navigate('/login', { replace: true })
    }
  }, [isLoading, data, navigate])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (!data?.passwordSet || !data?.loggedIn) {
    return null
  }

  return <>{children}</>
}
