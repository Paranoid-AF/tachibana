import type { ReactNode } from 'react'
import { useLocation } from 'wouter'
import { KeyRound, Shield, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { DeviceList } from './device-list'
import { AccountPanel } from './account-panel'

interface AppLayoutProps {
  children: ReactNode
}

function NavLink({
  href,
  icon: Icon,
  children,
}: {
  href: string
  icon: LucideIcon
  children: ReactNode
}) {
  const [location, navigate] = useLocation()
  const active = location === href

  return (
    <button
      onClick={() => navigate(href)}
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  )
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left sidebar */}
      <aside className="w-72 shrink-0 flex flex-col gap-3 p-4 overflow-y-auto">
        {/* Logo + app name */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-lg border-2 border-border shrink-0" />
          <div>
            <div className="font-semibold text-sm leading-tight">Tachibana</div>
            <div className="text-xs text-muted-foreground">Web UI · v0.1.0</div>
          </div>
        </div>

        <DeviceList />
        <AccountPanel />

        <nav className="flex flex-col gap-1 mt-auto">
          <NavLink href="/agents" icon={KeyRound}>
            MCP &amp; Skills
          </NavLink>
          <NavLink href="/security" icon={Shield}>
            Security
          </NavLink>
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
