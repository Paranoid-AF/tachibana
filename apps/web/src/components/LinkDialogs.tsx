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

interface TrustModalProps {
  open: boolean
  deviceName: string | undefined
  onClose: () => void
}

export function TrustModal({ open, deviceName, onClose }: TrustModalProps) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trust this computer</DialogTitle>
          <DialogDescription>
            Unlock <strong>{deviceName}</strong> and tap{' '}
            <strong>Trust</strong> when prompted on the device.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Spinner className="w-4 h-4 flex-shrink-0" />
          Waiting for trust confirmation…
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface LinkErrorDialogProps {
  error: string | null
  onClose: () => void
}

export function LinkErrorDialog({ error, onClose }: LinkErrorDialogProps) {
  return (
    <Dialog open={error !== null} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Failed to link device</DialogTitle>
          <DialogDescription>{error}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface AuthRequiredDialogProps {
  open: boolean
  onClose: () => void
  onSignIn: () => void
}

export function AuthRequiredDialog({
  open,
  onClose,
  onSignIn,
}: AuthRequiredDialogProps) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apple Account required</DialogTitle>
          <DialogDescription>
            You need to sign in with an Apple Account to link a device to the
            developer portal.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSignIn}>Sign in</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
