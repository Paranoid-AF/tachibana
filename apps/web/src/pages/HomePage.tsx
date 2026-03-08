import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'

import { useSession } from '@/hooks/useSession'
import { useDevices } from '@/hooks/useDevices'
import { AppLayout } from '@/components/AppLayout'
import { LinkDeviceGuide } from '@/components/LinkDeviceGuide'

export function HomePage() {
  const [, navigate] = useLocation()
  const hasCheckedRef = useRef(false)

  const { data: sessionInfo, isLoading: sessionLoading } = useSession()
  const { data: devices = [], isLoading: devicesLoading } = useDevices({
    enabled: sessionInfo?.loggedIn === true,
  })

  const isLoading =
    sessionLoading || (sessionInfo?.loggedIn === true && devicesLoading)

  const linkedConnected = devices.filter(
    d => d.paired && d.registered && d.connected,
  )

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
      }
    }
  }, [isLoading, sessionInfo, linkedConnected, navigate])

  if (isLoading || !sessionInfo?.loggedIn) return null

  // Prevent one-frame flash before useEffect redirect fires
  if (!hasCheckedRef.current && linkedConnected.length > 0) return null

  return (
    <AppLayout>
      <div className="flex-1 overflow-hidden">
        <LinkDeviceGuide />
      </div>
    </AppLayout>
  )
}
