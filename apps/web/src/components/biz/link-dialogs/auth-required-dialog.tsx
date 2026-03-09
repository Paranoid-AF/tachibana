import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

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
