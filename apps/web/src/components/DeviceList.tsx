import { useLocation } from 'wouter'
import { LuCheck } from 'react-icons/lu'

import { cn } from '@/libs/utils'
import { useSession } from '@/hooks/useSession'
import { useDevices } from '@/hooks/useDevices'
import { useLinkDevice } from '@/hooks/useLinkDevice'
import {
  TrustModal,
  LinkErrorDialog,
  AuthRequiredDialog,
} from '@/components/LinkDialogs'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { MergedDeviceInfo } from '@/types'

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

  const linked = devices.filter(d => d.paired && d.registered)
  const notLinked = devices.filter(d => !d.paired || !d.registered)
  const showSubtitles = linked.length > 0 && notLinked.length > 0

  return (
    <>
      <div className="rounded-xl border border-border p-3 flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-foreground mb-1 px-1">
          Devices
        </div>

        {devicesLoading ? (
          <div className="flex justify-center py-3">
            <Spinner className="w-4 h-4 text-muted-foreground" />
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

interface DeviceRowProps {
  device: MergedDeviceInfo
  onLink?: () => void
  isLinking?: boolean
  isSelected?: boolean
  onClick?: () => void
}

function DeviceRow({
  device,
  onLink,
  isLinking,
  isSelected,
  onClick,
}: DeviceRowProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-1 py-1.5 rounded-md transition-colors',
        isSelected ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50',
        onClick && !isSelected && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <div className="w-4 flex-shrink-0">
        {device.paired && device.registered && (
          <LuCheck
            className={cn(
              'w-3.5 h-3.5',
              isSelected ? 'text-primary-foreground' : 'text-foreground'
            )}
          />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate leading-tight">
          {device.name}
        </div>
        <div
          className={cn(
            'text-[11px] font-mono truncate',
            isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {device.connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {onLink ? (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={e => {
            e.stopPropagation()
            onLink()
          }}
          disabled={isLinking}
        >
          {isLinking ? 'Linking' : 'Link'}
        </Button>
      ) : null}
    </div>
  )
}
