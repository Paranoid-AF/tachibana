import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('authRequired.title')}</DialogTitle>
          <DialogDescription>
            {t('authRequired.description')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onSignIn}>{t('common.signIn')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
