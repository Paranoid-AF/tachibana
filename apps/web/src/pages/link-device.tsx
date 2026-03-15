import { useEffect, useCallback } from 'react'
import { useLocation } from 'wouter'
import { Usb } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useSession } from '@/hooks/use-session'
import { useDevices } from '@/hooks/use-devices'
import { useLinkDevice } from '@/hooks/use-link-device'
import {
  TrustModal,
  LinkErrorDialog,
  AuthRequiredDialog,
} from '@/components/biz/link-dialogs'
import { AppLayout } from '@/components/biz/app-layout'
import { Button } from '@/components/ui/button'

export function LinkDevicePage() {
  const { t } = useTranslation()
  const [, navigate] = useLocation()

  const { data: sessionInfo, isLoading: sessionLoading } = useSession()
  const { data: devices = [] } = useDevices({
    enabled: sessionInfo?.loggedIn === true,
  })
  const {
    handleLink,
    isPending,
    pendingUdid,
    trustModalProps,
    linkErrorProps,
    authDialogProps,
  } = useLinkDevice()

  useEffect(() => {
    if (!sessionLoading && !sessionInfo?.loggedIn)
      navigate('/signin', { replace: true })
  }, [sessionLoading, sessionInfo, navigate])

  const firstAvailableDevice = devices.find(d => d.linked && d.connected)

  const handleDone = useCallback(() => {
    if (firstAvailableDevice) navigate(`/device/${firstAvailableDevice.udid}`)
  }, [firstAvailableDevice, navigate])

  if (sessionLoading || !sessionInfo?.loggedIn) return null

  return (
    <AppLayout>
      <div className="flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-lg">
            <div className="rounded-2xl border border-border p-10">
              <h1 className="text-2xl font-bold mb-8">
                {t('linkDevice.title')}
              </h1>

              {/* USB instruction */}
              <div className="flex items-center gap-4 mb-8">
                <div className="rounded-xl border-2 border-border p-3 shrink-0">
                  <Usb className="w-7 h-7" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t('linkDevice.usbInstruction')}
                </p>
              </div>

              <p className="text-sm font-medium mb-3">
                {t('linkDevice.chooseDevice')}
              </p>

              {/* Connected unlinked devices */}
              <div className="rounded-xl border border-border divide-y divide-border mb-6">
                {!devices.length ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    {t('linkDevice.noDevices')}
                  </div>
                ) : (
                  devices.map(device => (
                    <div
                      key={device.udid}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {device.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {t('linkDevice.connected')}
                        </div>
                      </div>
                      {device.linked ? (
                        <span className="text-xs text-muted-foreground font-medium shrink-0 px-3">
                          {t('linkDevice.linked')}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-3 text-xs shrink-0"
                          onClick={() =>
                            handleLink(device, sessionInfo?.loggedIn ?? false)
                          }
                          disabled={isPending && pendingUdid === device.udid}
                        >
                          {isPending && pendingUdid === device.udid
                            ? t('linkDevice.linking')
                            : t('common.link')}
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <Button
                className="w-full"
                onClick={handleDone}
                disabled={!firstAvailableDevice}
              >
                {t('linkDevice.done')}
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
      </div>
    </AppLayout>
  )
}
