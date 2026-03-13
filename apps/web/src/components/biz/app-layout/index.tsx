import { type ReactNode, useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { KeyRound, Shield, type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { DeviceList } from './device-list'
import { AccountPanel } from './account-panel'

import openclawIcon from '../../../../assets/images/agents/openclaw-icon.svg'
import chatwiseIcon from '../../../../assets/images/agents/chatwise-icon.png'
import githubCopilotIcon from '../../../../assets/images/agents/githubcopilot-icon.svg'
import antigravityIcon from '../../../../assets/images/agents/antigravity-icon.svg'
import geminiCliIcon from '../../../../assets/images/agents/geminicli-icon.png'
import cursorIcon from '../../../../assets/images/agents/cursor-icon.svg'

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

const agents = [
  { name: 'OpenClaw', icon: openclawIcon, duration: 6_000 },
  { name: 'ChatWise', icon: chatwiseIcon, duration: 4_000 },
  { name: 'Cursor', icon: cursorIcon, duration: 2_000 },
  { name: 'GitHub Copilot', icon: githubCopilotIcon, duration: 2_000 },
  { name: 'Antigravity', icon: antigravityIcon, duration: 2_000 },
  { name: 'Gemini CLI', icon: geminiCliIcon, duration: 2_000 },
]

function GradientNavLink() {
  const [location, navigate] = useLocation()
  const active = location === '/agents'
  const [agentIndex, setAgentIndex] = useState(0)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setAgentIndex(i => (i + 1) % agents.length)
    }, agents[agentIndex].duration)
    return () => clearTimeout(timeout)
  }, [agentIndex])

  return (
    <button
      onClick={() => navigate('/agents')}
      className={cn(
        'flex flex-col gap-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors w-full text-left',
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
      )}
    >
      {/* SVG gradient definition for the key icon */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <linearGradient
            id="mcp-icon-gradient"
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="0"
            x2="24"
            y2="0"
          >
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="50%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#fb923c" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              values="-12 0; 12 0; -12 0"
              dur="3s"
              repeatCount="indefinite"
            />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex items-center gap-2">
        {active ? (
          <KeyRound className="w-7 h-7 shrink-0" />
        ) : (
          <>
            {/* Stacked icon: agent icon behind, key icon in front */}
            <div className="relative w-7 h-7 shrink-0">
              {agents.map((a, i) => (
                <img
                  key={a.name}
                  src={a.icon}
                  alt={a.name}
                  className={cn(
                    'absolute inset-0 w-7 h-7 object-contain transition-opacity duration-500',
                    i === agentIndex ? 'opacity-100' : 'opacity-0'
                  )}
                />
              ))}
              <KeyRound className="absolute -bottom-1.5 -right-1.5 w-5 h-5 [&>*]:[stroke:url(#mcp-icon-gradient)] [&>*]:[fill:white]" />
            </div>
          </>
        )}
        <div className="flex flex-col flex-1 min-w-0">
          <span className={cn(
            active
              ? ''
              : 'animate-gradient-flow bg-gradient-to-r from-purple-500 via-pink-500 via-orange-400 to-purple-500 bg-[length:200%_auto] bg-clip-text text-transparent'
          )}>
            MCP &amp; Skills
          </span>
          <div className="relative h-4">
            {active ? (
              <span className="absolute inset-0 text-xs opacity-80 whitespace-nowrap truncate">
                Works with agents
              </span>
            ) : (
              agents.map((a, i) => (
                <span
                  key={a.name}
                  className={cn(
                    'absolute inset-0 text-xs text-muted-foreground whitespace-nowrap truncate transition-opacity duration-500',
                    i === agentIndex ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  Works with {a.name}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
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

        <nav className="flex flex-col gap-1">
          <GradientNavLink />
          <NavLink href="/security" icon={Shield}>
            Security
          </NavLink>
        </nav>

        <div className="mt-auto">
          <AccountPanel />
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
