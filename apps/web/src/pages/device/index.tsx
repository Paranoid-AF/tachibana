import { useEffect } from 'react'
import { useLocation, useParams } from 'wouter'
import { PlugZap, Link2, CircleAlert } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useTranslation } from 'react-i18next'

import { useSession } from '@/hooks/use-session'
import { useDevices } from '@/hooks/use-devices'
import { useLinkDevice } from '@/hooks/use-link-device'
import { TrustModal, LinkErrorDialog } from '@/components/biz/link-dialogs'
import { AppLayout } from '@/components/biz/app-layout'
import { Button } from '@/components/ui/button'
import { DeviceNotice } from './components/device-notice'
import { DeviceScreen } from './components/device-screen'
import { ControlPanel } from './components/control-panel'

export function DevicePage() {
  const { t } = useTranslation()
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
        title={t('device.notFound.title')}
        description={t('device.notFound.description')}
      />
    )
  } else if (!device.connected) {
    screenContent = (
      <DeviceNotice
        icon={PlugZap}
        title={t('device.disconnected.title')}
        description={t('device.disconnected.description', {
          deviceName: device.name,
        })}
      />
    )
  } else if (!device.linked) {
    screenContent = (
      <DeviceNotice
        icon={Link2}
        title={t('device.notLinked.title')}
        description={t('device.notLinked.description', {
          deviceName: device.name,
        })}
      >
        <Button
          size="sm"
          onClick={() => handleLink(device, sessionInfo.loggedIn)}
          disabled={isPending}
        >
          {t('common.link')}
        </Button>
      </DeviceNotice>
    )
  } else {
    screenContent = <DeviceScreen udid={udid} email={sessionInfo.email} />
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

          {/* Control panel */}
          <Panel defaultSize={60} minSize={20}>
            {device?.linked && device?.connected ? (
              <ControlPanel udid={udid} />
            ) : (
              <div className="p-4" />
            )}
          </Panel>
        </Group>
      </AppLayout>

      <TrustModal {...trustModalProps} />
      <LinkErrorDialog {...linkErrorProps} />
    </>
  )
}
