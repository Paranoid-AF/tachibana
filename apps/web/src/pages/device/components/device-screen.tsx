import { useEffect, useRef, useState } from 'react'
import { MonitorX } from 'lucide-react'

import { Spinner } from '@/components/ui/spinner'
import Autoplay from 'embla-carousel-autoplay'

import { Button } from '@/components/ui/button'
import {
  Carousel,
  CarouselContent,
  CarouselDots,
  CarouselItem,
} from '@/components/ui/carousel'
import { DeviceNotice } from './device-notice'
import { ScreenOverlay } from './screen-overlay'
import { getWindowSize, type WindowSize } from '@/lib/wda-api'

import guideTrustImg from '../../../../assets/images/device/guide-trust.png'
import guideModeImg from '../../../../assets/images/device/guide-mode.png'

type ScreenState = 'preparing' | 'ready' | 'error'

interface DeviceScreenProps {
  udid: string
  email?: string
}

function useWdaStatus(udid: string, enabled: boolean) {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await fetch(`/api/devices/${udid}/wda-status`)
          if (cancelled) return
          const data = (await res.json()) as { state: string; error?: string }
          if (data.state === 'error' && data.error) {
            setError(data.error)
            return
          }
          if (data.state === 'ready') return
        } catch {
          /* ignore */
        }
        await new Promise(r => setTimeout(r, 3_000))
      }
    }
    poll()
    return () => {
      cancelled = true
    }
  }, [udid, enabled])

  return error
}

function GuidePage({
  step,
  title,
  description,
  children,
}: {
  step: number
  title: string
  description: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <CarouselItem>
      <div className="text-xs text-muted-foreground border rounded-md overflow-hidden text-left">
        <div className="relative @container">{children}</div>
        <div className="px-3 py-2">
          <span className="font-medium text-foreground">
            Step {step}: {title}
          </span>
          <p className="mt-1">{description}</p>
        </div>
      </div>
    </CarouselItem>
  )
}

function SetupHints({ email }: { email?: string }) {
  const autoplay = useRef(Autoplay({ delay: 4000, stopOnInteraction: false }))

  return (
    <Carousel
      plugins={[autoplay.current]}
      opts={{ loop: true }}
      className="w-full max-w-xs pt-2"
      onMouseEnter={() => autoplay.current.stop()}
      onMouseLeave={() => autoplay.current.play()}
    >
      <CarouselContent>
        <GuidePage
          step={1}
          title="Trust developer certificate"
          description={
            <>
              In <strong>Settings → General → VPN & Device Management</strong>,
              trust <strong>{email ?? 'your Apple account'}</strong>.
            </>
          }
        >
          <img
            src={guideTrustImg}
            alt="Trust developer"
            className="w-full h-120 object-contain bg-muted"
          />
          {email && (
            <span
              className="absolute text-[3cqw] text-black font-normal leading-none pointer-events-none"
              style={{ top: '35.7%', left: '28.5%' }}
            >
              {email}
            </span>
          )}
        </GuidePage>

        <GuidePage
          step={2}
          title="Enable Developer Mode"
          description={
            <>
              In <strong>Settings → Privacy & Security → Developer Mode</strong>
              , turn on Developer Mode and restart when prompted.
            </>
          }
        >
          <img
            src={guideModeImg}
            alt="Developer Mode"
            className="w-full h-120 object-contain bg-muted"
          />
        </GuidePage>
      </CarouselContent>
      <CarouselDots />
    </Carousel>
  )
}

export function DeviceScreen({ udid, email }: DeviceScreenProps) {
  const [state, setState] = useState<ScreenState>('preparing')
  const [key, setKey] = useState(0)
  const [windowSize, setWindowSize] = useState<WindowSize | null>(null)
  const wdaError = useWdaStatus(udid, state !== 'ready')

  const src = `/api/devices/${udid}/screen?k=${key}`

  const retry = () => {
    setState('preparing')
    setKey(k => k + 1)
  }

  // Fetch WDA window size once screen is ready
  useEffect(() => {
    if (state !== 'ready') return
    let cancelled = false
    getWindowSize(udid)
      .then(size => {
        if (!cancelled) setWindowSize(size)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [udid, state])

  const errorDescription =
    wdaError ?? 'Could not start screen. Make sure the device is connected.'

  return (
    <div className="flex-1 flex overflow-hidden relative overscroll-contain">
      {state !== 'ready' && (
        <DeviceNotice
          icon={state === 'error' ? MonitorX : Spinner}
          title={state === 'error' ? 'Screen unavailable' : 'Preparing device…'}
          description={
            state === 'error'
              ? errorDescription
              : "If it's first time using this device, you need to follow steps below to set it up."
          }
        >
          {state === 'error' && (
            <Button size="sm" onClick={retry}>
              Retry
            </Button>
          )}
          <SetupHints email={email} />
        </DeviceNotice>
      )}
      <div className={`relative flex items-center justify-center ${state === 'ready' ? 'w-full h-full' : 'w-0 h-0 overflow-hidden'}`}>
        <img
          key={key}
          src={src}
          alt="Device screen"
          className={`w-full h-full object-contain pointer-events-none ${state === 'ready' ? '' : 'hidden'}`}
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
        />
        {state === 'ready' && windowSize && (
          <ScreenOverlay
            udid={udid}
            windowSize={windowSize}
          />
        )}
      </div>
    </div>
  )
}
