import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'

import { useSession } from '@/hook/use-session'
import { useDevices } from '@/hook/use-devices'

export function HomePage() {
  const [, navigate] = useLocation()
  const hasCheckedRef = useRef(false)

  const { data: sessionInfo, isLoading: sessionLoading } = useSession()
  const { data: devices = [], isLoading: devicesLoading } = useDevices({
    enabled: sessionInfo?.loggedIn === true,
  })

  const isLoading =
    sessionLoading || (sessionInfo?.loggedIn === true && devicesLoading)

  const linkedConnected = devices.filter(d => d.linked && d.connected)

  useEffect(() => {
    if (isLoading) return

    if (!sessionInfo?.loggedIn) {
      navigate('/signin', { replace: true })
      return
    }

    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true
      if (linkedConnected.length > 0) {
        navigate(`/device/${linkedConnected[0].udid}`, { replace: true })
      } else {
        navigate('/link', { replace: true })
      }
    }
  }, [isLoading, sessionInfo, linkedConnected, navigate])

  return null
}
