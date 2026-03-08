import { useLocation } from 'wouter'
import { LuUsb } from 'react-icons/lu'

import { useSession } from '@/hooks/useSession'
import { useDevices } from '@/hooks/useDevices'
import { useLinkDevice } from '@/hooks/useLinkDevice'
import { TrustModal, LinkErrorDialog, AuthRequiredDialog } from '@/components/LinkDialogs'
import { Button } from '@/components/ui/button'

export function LinkDeviceGuide() {
  const [, navigate] = useLocation()

  const { data: sessionInfo } = useSession()
  const { data: devices = [] } = useDevices()
  const { handleLink, isPending, pendingUdid, trustModalProps, linkErrorProps, authDialogProps } =
    useLinkDevice()

  const connectedUnlinked = devices.filter(
    d => d.connected && (!d.paired || !d.registered),
  )
  const linkedConnected = devices.filter(
    d => d.paired && d.registered && d.connected,
  )

  function handleDone() {
    if (linkedConnected.length > 0) {
      navigate(`/device/${linkedConnected[0].udid}`)
    }
  }

  return (
    <>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <div className="rounded-2xl border border-border p-10">
            <h1 className="text-2xl font-bold mb-8">Link an iPhone or iPad</h1>

            {/* USB instruction */}
            <div className="flex items-center gap-4 mb-8">
              <div className="rounded-xl border-2 border-border p-3 flex-shrink-0">
                <LuUsb className="w-7 h-7" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                First, connect an iPhone or iPad via USB cable.
              </p>
            </div>

            <p className="text-sm font-medium mb-3">Then, choose a device to link</p>

            {/* Connected unlinked devices */}
            <div className="rounded-xl border border-border divide-y divide-border mb-6">
              {connectedUnlinked.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No devices connected via USB.
                </div>
              ) : (
                connectedUnlinked.map(device => (
                  <div
                    key={device.udid}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {device.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        Connected
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs flex-shrink-0"
                      onClick={() => handleLink(device, sessionInfo?.loggedIn ?? false)}
                      disabled={isPending && pendingUdid === device.udid}
                    >
                      {isPending && pendingUdid === device.udid ? 'Linking…' : 'Link'}
                    </Button>
                  </div>
                ))
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleDone}
              disabled={linkedConnected.length === 0}
            >
              Done
            </Button>
          </div>
        </div>
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
