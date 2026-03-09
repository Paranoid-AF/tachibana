import { useEffect } from 'react'
import { useLocation, useParams } from 'wouter'
import { PlugZap, Link2, CircleAlert } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'

import { useSession } from '@/hooks/use-session'
import { useDevices } from '@/hooks/use-devices'
import { useLinkDevice } from '@/hooks/use-link-device'
import { TrustModal, LinkErrorDialog } from '@/components/biz/link-dialogs'
import { AppLayout } from '@/components/biz/app-layout'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DeviceNotice } from './components/device-notice'

export function DevicePage() {
  const [, navigate] = useLocation()
  const { udid } = useParams<{ udid: string }>()

  const { data: sessionInfo, isLoading: sessionLoading } = useSession()
  const { data: devices = [], isLoading: devicesLoading } = useDevices({
    enabled: sessionInfo?.loggedIn === true,
  })
  const { handleLink, isPending, trustModalProps, linkErrorProps } =
    useLinkDevice()

  const isLoading =
    sessionLoading || (sessionInfo?.loggedIn === true && devicesLoading)

  useEffect(() => {
    if (!sessionLoading && !sessionInfo?.loggedIn) {
      navigate('/signin', { replace: true })
    }
  }, [sessionLoading, sessionInfo, navigate])

  if (isLoading || !sessionInfo?.loggedIn) return null

  const device = devices.find(d => d.udid === udid)

  let screenContent: React.ReactNode

  if (!device) {
    screenContent = (
      <DeviceNotice
        icon={CircleAlert}
        title="Device not found"
        description="This device is not registered. Make sure it's connected and linked."
      />
    )
  } else if (!device.connected) {
    screenContent = (
      <DeviceNotice
        icon={PlugZap}
        title="Device disconnected"
        description={`Connect ${device.name} via USB to continue.`}
      />
    )
  } else if (!device.linked) {
    screenContent = (
      <DeviceNotice
        icon={Link2}
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
    screenContent = (
      <div className="flex-1 p-4 overflow-hidden">
        <div className="h-full rounded-xl border border-border" />
      </div>
    )
  }

  return (
    <>
      <AppLayout>
        <Group orientation="horizontal" className="flex-1 overflow-hidden">
          {/* Device screen */}
          <Panel defaultSize={40} minSize={20} className="flex flex-col">
            {screenContent}
          </Panel>

          <Separator className="w-px bg-border" />

          {/* Main panel */}
          <Panel defaultSize={60} minSize={20}>
            <ScrollArea className="h-full">
              <div className="p-4" />
            </ScrollArea>
          </Panel>
        </Group>
      </AppLayout>

      <TrustModal {...trustModalProps} />
      <LinkErrorDialog {...linkErrorProps} />
    </>
  )
}
