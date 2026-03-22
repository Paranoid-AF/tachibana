import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/component/ui/button'
import type { DeviceListResponseItem } from '@/types'

export interface DeviceRowProps {
  device: DeviceListResponseItem
  onLink?: () => void
  isLinking?: boolean
  isSelected?: boolean
  onClick?: () => void
}

export function DeviceRow({
  device,
  onLink,
  isLinking,
  isSelected,
  onClick,
}: DeviceRowProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors',
        isSelected
          ? 'bg-primary text-primary-foreground'
          : onClick && 'hover:bg-muted/50',
        onClick && !isSelected && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate leading-tight">
          {device.name}
        </div>
        <div
          className={cn(
            'text-[11px] font-mono truncate',
            isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'
          )}
        >
          {device.connected
            ? t('deviceList.connected')
            : t('deviceList.disconnected')}
        </div>
      </div>

      {onLink ? (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={e => {
            e.stopPropagation()
            onLink()
          }}
          disabled={isLinking}
        >
          {isLinking ? t('deviceList.linking') : t('deviceList.link')}
        </Button>
      ) : null}
    </div>
  )
}
