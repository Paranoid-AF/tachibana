import type { ReactNode } from 'react'

import { DeviceList } from './DeviceList'
import { AccountPanel } from './AccountPanel'

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left sidebar */}
      <aside className="w-72 flex-shrink-0 flex flex-col gap-3 p-4 border-r border-border overflow-y-auto">
        {/* Logo + app name */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg border-2 border-border flex-shrink-0" />
          <div>
            <div className="font-semibold text-sm leading-tight">Tachibana</div>
            <div className="text-xs text-muted-foreground">Web UI · v0.1.0</div>
          </div>
        </div>

        <DeviceList />
        <AccountPanel />
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
