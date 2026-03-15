import { Trans, useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('trustModal.title')}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="trustModal.description"
              values={{ deviceName }}
              components={{ strong: <strong /> }}
            />
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <Spinner className="shrink-0" />
          {t('trustModal.waiting')}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
