import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
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
            Unlock <strong>{deviceName}</strong> and tap <strong>Trust</strong>{' '}
            when prompted on the device.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
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
