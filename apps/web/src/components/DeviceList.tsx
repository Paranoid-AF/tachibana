import { useState } from 'react'
import { useLocation } from 'wouter'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LuCheck } from 'react-icons/lu'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface MergedDevice {
  udid: string
  name: string
  productType?: string
  productVersion?: string
  connected: boolean
  paired: boolean
  registered: boolean
}

async function fetchDevices(): Promise<MergedDevice[]> {
  const res = await fetch('/api/devices')
  if (!res.ok) throw new Error('Failed to fetch devices')
  return res.json()
}

async function fetchSessionInfo(): Promise<{
  loggedIn: boolean
  email?: string
}> {
  const res = await fetch('/api/auth/session')
  if (!res.ok) throw new Error('Failed to fetch session')
  return res.json()
}

async function linkDevice(udid: string, name: string) {
  const res = await fetch(`/api/devices/${udid}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? 'Failed to link device')
  }
  return res.json()
}

export function DeviceList() {
  const [, navigate] = useLocation()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [showTrustModal, setShowTrustModal] = useState(false)
  const [linkingDevice, setLinkingDevice] = useState<MergedDevice | null>(null)
  const queryClient = useQueryClient()

  const { data: devices = [], isLoading: devicesLoading } = useQuery<
    MergedDevice[]
  >({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    refetchInterval: 3000,
  })

  const { data: sessionInfo } = useQuery({
    queryKey: ['auth/session'],
    queryFn: fetchSessionInfo,
    refetchInterval: 5000,
  })

  const linkMutation = useMutation({
    mutationFn: ({ udid, name }: { udid: string; name: string }) =>
      linkDevice(udid, name),
    onSuccess: () => {
      setShowTrustModal(false)
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
    onError: (err: Error) => {
      setShowTrustModal(false)
      setLinkError(err.message)
    },
  })

  const linked = devices.filter(d => d.paired && d.registered)
  const notLinked = devices.filter(d => !d.paired || !d.registered)
  const showSubtitles = linked.length > 0 && notLinked.length > 0

  function handleLink(device: MergedDevice) {
    if (!sessionInfo?.loggedIn) {
      setShowAuthDialog(true)
      return
    }
    setLinkingDevice(device)
    setShowTrustModal(true)
    linkMutation.mutate({ udid: device.udid, name: device.name })
  }

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
              <DeviceRow key={device.udid} device={device} />
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
                onLink={device.connected ? () => handleLink(device) : undefined}
                isLinking={
                  linkMutation.isPending &&
                  linkMutation.variables?.udid === device.udid
                }
              />
            ))}
          </>
        )}
      </div>

      <Dialog
        open={linkError !== null}
        onOpenChange={open => !open && setLinkError(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Failed to link device</DialogTitle>
            <DialogDescription>{linkError}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setLinkError(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showTrustModal}
        onOpenChange={open => !open && setShowTrustModal(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trust this computer</DialogTitle>
            <DialogDescription>
              Unlock <strong>{linkingDevice?.name}</strong> and tap{' '}
              <strong>Trust</strong> when prompted on the device.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Spinner className="w-4 h-4 flex-shrink-0" />
            Waiting for trust confirmation…
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTrustModal(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apple Account required</DialogTitle>
            <DialogDescription>
              You need to sign in with an Apple Account to link a device to the
              developer portal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuthDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowAuthDialog(false)
                navigate('/signin')
              }}
            >
              Sign in
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

interface DeviceRowProps {
  device: MergedDevice
  onLink?: () => void
  isLinking?: boolean
}

function DeviceRow({ device, onLink, isLinking }: DeviceRowProps) {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5 rounded-md hover:bg-muted/50 transition-colors">
      <div className="w-4 flex-shrink-0">
        {device.paired && device.registered && (
          <LuCheck className="w-3.5 h-3.5 text-foreground" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate leading-tight">
          {device.name}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono truncate">
          {device.connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      {onLink ? (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={onLink}
          disabled={isLinking}
        >
          {isLinking ? 'Linking' : 'Link'}
        </Button>
      ) : null}
    </div>
  )
}
