// WDA proxy helper — all calls go through POST /api/devices/:udid/wda

const sessionCache = new Map<string, string>()

interface WdaResponse {
  value: unknown
  sessionId?: string
}

export async function wdaFetch(
  udid: string,
  method: 'GET' | 'POST' | 'DELETE',
  pathname: string,
  payload?: unknown
): Promise<WdaResponse> {
  const res = await fetch(`/api/devices/${udid}/wda`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, pathname, payload }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? `WDA request failed: ${res.status}`)
  }
  const data: WdaResponse = await res.json()
  if (data.sessionId) sessionCache.set(udid, data.sessionId)
  return data
}

function sid(udid: string): string {
  const s = sessionCache.get(udid)
  if (!s) throw new Error('No WDA session — call getWindowSize first')
  return s
}

// --- W3C Actions helpers ---

interface PointerAction {
  type: 'pointerMove' | 'pointerDown' | 'pointerUp' | 'pause'
  duration?: number
  x?: number
  y?: number
  button?: number
}

function pointerActions(actions: PointerAction[]) {
  return {
    actions: [
      {
        type: 'pointer' as const,
        id: 'finger1',
        parameters: { pointerType: 'touch' as const },
        actions: actions.map(a => {
          if (a.type === 'pause')
            return { type: 'pause', duration: a.duration ?? 0 }
          if (a.type === 'pointerDown')
            return { type: 'pointerDown', button: 0 }
          if (a.type === 'pointerUp') return { type: 'pointerUp', button: 0 }
          // pointerMove
          return {
            type: 'pointerMove',
            duration: a.duration ?? 0,
            x: Math.round(a.x ?? 0),
            y: Math.round(a.y ?? 0),
            origin: 'viewport' as const,
          }
        }),
      },
    ],
  }
}

// --- Typed action helpers ---

export async function tap(udid: string, x: number, y: number) {
  return wdaFetch(
    udid,
    'POST',
    `/session/${sid(udid)}/actions`,
    pointerActions([
      { type: 'pointerMove', x, y },
      { type: 'pointerDown' },
      { type: 'pause', duration: 50 },
      { type: 'pointerUp' },
    ])
  )
}

export async function drag(
  udid: string,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  duration: number
) {
  return wdaFetch(
    udid,
    'POST',
    `/session/${sid(udid)}/actions`,
    pointerActions([
      { type: 'pointerMove', x: fromX, y: fromY },
      { type: 'pointerDown' },
      {
        type: 'pointerMove',
        x: toX,
        y: toY,
        duration: Math.round(duration * 1000),
      },
      { type: 'pointerUp' },
    ])
  )
}

export async function doubleTap(udid: string, x: number, y: number) {
  return wdaFetch(udid, 'POST', `/session/${sid(udid)}/wda/doubleTap`, {
    x: Math.round(x),
    y: Math.round(y),
  })
}

export async function touchAndHold(
  udid: string,
  x: number,
  y: number,
  duration: number
) {
  return wdaFetch(udid, 'POST', `/session/${sid(udid)}/wda/touchAndHold`, {
    x: Math.round(x),
    y: Math.round(y),
    duration,
  })
}

export async function homescreen(udid: string) {
  return wdaFetch(udid, 'POST', '/wda/homescreen')
}

export async function lock(udid: string) {
  return wdaFetch(udid, 'POST', '/wda/lock')
}

export async function unlock(udid: string) {
  return wdaFetch(udid, 'POST', '/wda/unlock')
}

export async function isLocked(udid: string): Promise<boolean> {
  const res = await wdaFetch(udid, 'GET', '/wda/locked')
  return res.value as boolean
}

export async function keys(udid: string, chars: string[]) {
  return wdaFetch(udid, 'POST', `/session/${sid(udid)}/wda/keys`, {
    value: chars,
  })
}

export async function launchApp(udid: string, bundleId: string) {
  return wdaFetch(udid, 'POST', `/session/${sid(udid)}/wda/apps/launch`, {
    bundleId,
  })
}

export async function terminateApp(udid: string, bundleId: string) {
  return wdaFetch(udid, 'POST', `/session/${sid(udid)}/wda/apps/terminate`, {
    bundleId,
  })
}

export interface WindowSize {
  width: number
  height: number
}

export async function getWindowSize(udid: string): Promise<WindowSize> {
  const res = await wdaFetch(udid, 'GET', '/window/size')
  return res.value as WindowSize
}
