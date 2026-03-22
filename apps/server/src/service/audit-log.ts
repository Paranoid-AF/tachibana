import { insertDeviceLog, completeDeviceLog } from '../db/index.ts'
import { LOG_STATUS, LOG_SOURCE } from '../const/log.ts'

// ---------------------------------------------------------------------------
// Core logging wrapper
// ---------------------------------------------------------------------------

interface LogDeviceActionOpts<T> {
  udid: string
  authId: number | null
  source: (typeof LOG_SOURCE)[keyof typeof LOG_SOURCE]
  action: string
  params?: Record<string, unknown>
  work: () => Promise<T>
}

export async function logDeviceAction<T>(
  opts: LogDeviceActionOpts<T>
): Promise<T> {
  // Strip udid from stored params and filter out long string values
  const filteredParams: Record<string, unknown> = {}
  if (opts.params) {
    for (const [key, value] of Object.entries(opts.params)) {
      if (key === 'udid') continue
      if (typeof value === 'string' && value.length > 2000) continue
      filteredParams[key] = value
    }
  }

  const paramsJson =
    Object.keys(filteredParams).length > 0
      ? JSON.stringify(filteredParams)
      : undefined

  const logId = insertDeviceLog({
    udid: opts.udid,
    authId: opts.authId ?? undefined,
    source: opts.source,
    action: opts.action,
    params: paramsJson,
  })

  try {
    const result = await opts.work()
    completeDeviceLog(logId, LOG_STATUS.SUCCESS)
    return result
  } catch (err) {
    completeDeviceLog(
      logId,
      LOG_STATUS.FAILED,
      err instanceof Error ? err.message : String(err)
    )
    throw err
  }
}

// ---------------------------------------------------------------------------
// WDA action resolver
// ---------------------------------------------------------------------------

export function resolveWdaAction(
  method: string,
  pathname: string,
  payload?: unknown
): string | null {
  // Static POST paths
  if (method === 'POST' && pathname === '/wda/homescreen') return 'go_home'
  if (method === 'POST' && pathname === '/wda/lock') return 'lock_device'
  if (method === 'POST' && pathname === '/wda/unlock') return 'unlock_device'

  // Session-based POST paths
  const sessionPrefix = /^\/session\/[^/]+/

  if (method === 'POST') {
    if (sessionPrefix.test(pathname)) {
      if (/^\/session\/[^/]+\/wda\/keys$/.test(pathname)) return 'type_text'
      if (/^\/session\/[^/]+\/wda\/doubleTap$/.test(pathname))
        return 'double_tap'
      if (/^\/session\/[^/]+\/wda\/touchAndHold$/.test(pathname))
        return 'touch_and_hold'
      if (/^\/session\/[^/]+\/wda\/apps\/launch$/.test(pathname))
        return 'launch_app'
      if (/^\/session\/[^/]+\/wda\/apps\/terminate$/.test(pathname))
        return 'terminate_app'

      if (/^\/session\/[^/]+\/actions$/.test(pathname)) {
        return resolveActionsPayload(payload)
      }
    }
  }

  // GET paths
  if (method === 'GET') {
    if (/^\/session\/[^/]+\/screenshot$/.test(pathname))
      return 'take_screenshot'
    if (pathname === '/window/size') return 'get_screen_size'
    if (pathname === '/wda/locked') return 'is_locked'
  }

  return null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveActionsPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as { actions?: unknown[] }
  if (!Array.isArray(p.actions) || p.actions.length === 0) return null

  const pointerAction = p.actions[0] as {
    actions?: Array<{ type: string; x?: number; y?: number }>
  }
  if (!Array.isArray(pointerAction.actions)) return null

  const moves = pointerAction.actions.filter(
    (a: { type: string; x?: number; y?: number }) =>
      a.type === 'pointerMove' && a.x !== undefined && a.y !== undefined
  )

  if (moves.length === 0) return null

  // Collect distinct coordinate pairs
  const coords = new Set(
    moves.map((m: { x?: number; y?: number }) => `${m.x},${m.y}`)
  )

  const hasDown = pointerAction.actions.some(
    (a: { type: string }) => a.type === 'pointerDown'
  )
  const hasUp = pointerAction.actions.some(
    (a: { type: string }) => a.type === 'pointerUp'
  )

  if (coords.size === 1 && hasDown && hasUp) return 'tap'
  if (coords.size > 1) return 'drag'

  return null
}
