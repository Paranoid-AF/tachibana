import { useState } from 'react'
import { useLocation } from 'wouter'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LuCheck } from 'react-icons/lu'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  status?: string
  connected: boolean
  linked: boolean
}

async function fetchDevices(): Promise<MergedDevice[]> {
  const res = await fetch('/api/devices')
  if (!res.ok) throw new Error('Failed to fetch devices')
  return res.json()
}

async function fetchSessionInfo(): Promise<{ loggedIn: boolean; email?: string }> {
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
  const queryClient = useQueryClient()

  const { data: devices = [] } = useQuery<MergedDevice[]>({
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
    mutationFn: ({ udid, name }: { udid: string; name: string }) => linkDevice(udid, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['devices'] }),
    onError: (err: Error) => setLinkError(err.message),
  })

  const linked = devices.filter((d) => d.linked)
  const unlinked = devices.filter((d) => !d.linked)
  const showSubtitles = linked.length > 0 && unlinked.length > 0
  const showUnlinkedSubtitle = unlinked.length > 0

  function handleLink(device: MergedDevice) {
    if (!sessionInfo?.loggedIn) {
      setShowAuthDialog(true)
      return
    }
    linkMutation.mutate({ udid: device.udid, name: device.name })
  }

  return (
    <>
      <div className="rounded-xl border border-border p-3 flex flex-col gap-1">
        <div className="text-xs font-medium uppercase tracking-wide text-foreground mb-1 px-1">
          Devices
        </div>

        {devices.length === 0 && (
          <p className="text-xs text-muted-foreground px-1 py-2">No devices found.</p>
        )}

        {showSubtitles && linked.length > 0 && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mt-1">
            Linked
          </div>
        )}

        {linked.map((device) => (
          <DeviceRow key={device.udid} device={device} />
        ))}

        {showUnlinkedSubtitle && (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 mt-1">
            Not linked
          </div>
        )}

        {unlinked.map((device) => (
          <DeviceRow
            key={device.udid}
            device={device}
            onLink={() => handleLink(device)}
            isLinking={linkMutation.isPending && linkMutation.variables?.udid === device.udid}
          />
        ))}
      </div>

      <Dialog open={linkError !== null} onOpenChange={(open) => !open && setLinkError(null)}>
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

      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apple Account required</DialogTitle>
            <DialogDescription>
              You need to sign in with an Apple Account to link a device to the developer portal.
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
        {device.linked && <LuCheck className="w-3.5 h-3.5 text-foreground" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate leading-tight">{device.name}</div>
        <div className="text-[11px] text-muted-foreground font-mono truncate">{device.udid}</div>
      </div>

      {onLink ? (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={onLink}
          disabled={isLinking}
        >
          {isLinking ? '...' : 'Link'}
        </Button>
      ) : (
        device.status && (
          <Badge
            variant={device.status === 'ENABLED' ? 'default' : 'secondary'}
            className="text-[10px] uppercase tracking-wide"
          >
            {device.status === 'ENABLED' ? 'Idle' : device.status}
          </Badge>
        )
      )}
    </div>
  )
}
