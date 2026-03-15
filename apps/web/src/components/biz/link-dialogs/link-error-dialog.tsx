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

interface LinkErrorDialogProps {
  error: string | null
  onClose: () => void
}

export function LinkErrorDialog({ error, onClose }: LinkErrorDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={error !== null} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('linkError.title')}</DialogTitle>
          <DialogDescription>{error}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>{t('common.ok')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
