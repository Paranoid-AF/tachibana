import type { ReactNode, ComponentType } from 'react'

interface DeviceNoticeProps {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  children?: ReactNode
}

export function DeviceNotice({
  icon: Icon,
  title,
  description,
  children,
}: DeviceNoticeProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-center max-w-xs">
        <Icon className="w-8 h-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        </div>
        {children}
      </div>
    </div>
  )
}
