import { useLocation } from 'wouter'

import { useSession } from '@/hooks/use-session'
import { useDevices } from '@/hooks/use-devices'
import { useLinkDevice } from '@/hooks/use-link-device'
import {
  TrustModal,
  LinkErrorDialog,
  AuthRequiredDialog,
} from '@/components/biz/link-dialogs'
import { Spinner } from '@/components/ui/spinner'
import { DeviceRow } from './device-row'

export function DeviceList() {
  const [location, navigate] = useLocation()

  const selectedUdid = location.startsWith('/device/')
    ? location.slice('/device/'.length)
    : null

  const { data: devices = [], isLoading: devicesLoading } = useDevices()
  const { data: sessionInfo } = useSession()
  const {
    handleLink,
    isPending,
    pendingUdid,
    trustModalProps,
    linkErrorProps,
    authDialogProps,
  } = useLinkDevice()

  const linked = devices.filter(d => d.linked)
  const notLinked = devices.filter(d => !d.linked)
  const showSubtitles = linked.length > 0 && notLinked.length > 0

  return (
    <>
      <div className="rounded-xl border border-border p-3 flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-foreground mb-1 px-1">
          Devices
        </div>

        {devicesLoading ? (
          <div className="flex justify-center py-3">
            <Spinner className="text-muted-foreground" />
          </div>
        ) : (
          <>
            {devices.length === 0 && (
              <p className="text-xs text-muted-foreground px-1 py-2">
                No devices found.
              </p>
            )}

            {showSubtitles && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mt-1">
                Linked
              </div>
            )}

            {linked.map(device => (
              <DeviceRow
                key={device.udid}
                device={device}
                isSelected={selectedUdid === device.udid}
                onClick={
                  device.connected
                    ? () => navigate(`/device/${device.udid}`)
                    : undefined
                }
              />
            ))}

            {showSubtitles && (
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mt-1">
                Not linked
              </div>
            )}

            {notLinked.map(device => (
              <DeviceRow
                key={device.udid}
                device={device}
                onLink={
                  device.connected
                    ? () => handleLink(device, sessionInfo?.loggedIn ?? false)
                    : undefined
                }
                isLinking={isPending && pendingUdid === device.udid}
              />
            ))}
          </>
        )}
      </div>

      <TrustModal {...trustModalProps} />
      <LinkErrorDialog {...linkErrorProps} />
      <AuthRequiredDialog
        {...authDialogProps}
        onSignIn={() => {
          authDialogProps.onClose()
          navigate('/signin')
        }}
      />
    </>
  )
}
