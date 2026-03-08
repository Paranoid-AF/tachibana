import { useEffect } from 'react'
import { useLocation, useParams } from 'wouter'
import { LuPlugZap, LuLink, LuCircleAlert } from 'react-icons/lu'

import { useSession } from '@/hooks/useSession'
import { useDevices } from '@/hooks/useDevices'
import { useLinkDevice } from '@/hooks/useLinkDevice'
import { TrustModal, LinkErrorDialog } from '@/components/LinkDialogs'
import { AppLayout } from '@/components/AppLayout'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

function DeviceNotice({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-center max-w-xs">
        <Icon className="w-8 h-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        {children}
      </div>
    </div>
  )
}

export function DevicePage() {
  const [, navigate] = useLocation()
  const { udid } = useParams<{ udid: string }>()

  const { data: sessionInfo, isLoading: sessionLoading } = useSession()
  const { data: devices = [], isLoading: devicesLoading } = useDevices({
    enabled: sessionInfo?.loggedIn === true,
  })
  const { handleLink, isPending, trustModalProps, linkErrorProps } = useLinkDevice()

  const isLoading =
    sessionLoading || (sessionInfo?.loggedIn === true && devicesLoading)

  useEffect(() => {
    if (!sessionLoading && !sessionInfo?.loggedIn) {
      navigate('/signin', { replace: true })
    }
  }, [sessionLoading, sessionInfo, navigate])

  if (isLoading || !sessionInfo?.loggedIn) return null

  const device = devices.find(d => d.udid === udid)

  let mainContent: React.ReactNode

  if (!device) {
    mainContent = (
      <DeviceNotice
        icon={LuCircleAlert}
        title="Device not found"
        description="This device is not registered. Make sure it's connected and linked."
      />
    )
  } else if (!device.connected) {
    mainContent = (
      <DeviceNotice
        icon={LuPlugZap}
        title="Device disconnected"
        description={`Connect ${device.name} via USB to continue.`}
      />
    )
  } else if (!device.paired || !device.registered) {
    mainContent = (
      <DeviceNotice
        icon={LuLink}
        title="Device not linked"
        description={`${device.name} needs to be linked before use.`}
      >
        <Button
          size="sm"
          onClick={() => handleLink(device, sessionInfo.loggedIn)}
          disabled={isPending}
        >
          Link
        </Button>
      </DeviceNotice>
    )
  } else {
    mainContent = (
      <div className="flex-1 p-4 overflow-hidden">
        <div className="h-full rounded-xl border border-border" />
      </div>
    )
  }

  const deviceName = device?.name ?? udid

  return (
    <>
      <AppLayout>
        {mainContent}

        {/* Right panel: Sessions */}
        <div className="w-72 flex-shrink-0 border-l border-border flex flex-col">
          <div className="px-4 py-3 border-b border-border">
            <span className="text-xs font-medium uppercase tracking-wide">
              Sessions for {deviceName}
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4" />
          </ScrollArea>
        </div>
      </AppLayout>

      <TrustModal {...trustModalProps} />
      <LinkErrorDialog {...linkErrorProps} />
    </>
  )
}
