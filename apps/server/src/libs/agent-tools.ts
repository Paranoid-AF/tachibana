import { z } from 'zod'

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { photos } from '@tbana/ios-connect'

import { deviceManager } from './device-manager.ts'
import { wdaManager } from './wda-manager.ts'
import { getDevicePrefs, setDevicePrefs } from './device-store.ts'
import {
  ensureWdaPorts,
  getFilteredApps,
  downloadPhotoToCache,
  ensureCompatibleImage,
} from './idevice-utils.ts'
import { MEDIA_MIME_TYPES } from '../consts/idevice.ts'
import { annotateScreenshot } from './image-annotate.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string
  title?: string
  description: string
  category?: string
  inputSchema: z.ZodObject<any>
  outputSchema?: z.ZodObject<any>
  handler: (params: any) => Promise<CallToolResult>
}

// ---------------------------------------------------------------------------
// WDA helpers
// ---------------------------------------------------------------------------

async function ensureWda(
  udid: string
): Promise<{ mainPort: number; sessionId: string }> {
  const { mainPort } = await ensureWdaPorts(udid)

  const sessionId = wdaManager.getSessionId(udid)
  if (!sessionId) {
    throw new Error('WDA session not available')
  }

  return { mainPort, sessionId }
}

async function wdaFetch(
  mainPort: number,
  method: string,
  pathname: string,
  payload?: unknown
): Promise<unknown> {
  const url = `http://localhost:${mainPort}${pathname}`
  const init: RequestInit = { method }
  if (payload !== undefined && method !== 'GET') {
    init.body = JSON.stringify(payload)
    init.headers = { 'Content-Type': 'application/json' }
  }
  const resp = await fetch(url, init)
  const data = (await resp.json()) as { value: unknown }
  if (!resp.ok) {
    const msg =
      (data.value as any)?.message ?? `WDA request failed: ${resp.status}`
    throw new Error(msg)
  }
  return data.value
}

function textResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ListDevicesSchema = z.object({})

const GetDevicePrefsSchema = z.object({
  udid: z.string().describe('Device UDID'),
})

const SetDevicePrefsSchema = z.object({
  udid: z.string().describe('Device UDID'),
  alwaysAwake: z.boolean().optional().describe('Keep the device screen on'),
})

const TapSchema = z.object({
  udid: z.string().describe('Device UDID'),
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
})

const DoubleTapSchema = z.object({
  udid: z.string().describe('Device UDID'),
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
})

const TouchAndHoldSchema = z.object({
  udid: z.string().describe('Device UDID'),
  x: z.number().describe('X coordinate'),
  y: z.number().describe('Y coordinate'),
  duration: z.number().describe('Hold duration in seconds'),
})

const DragSchema = z.object({
  udid: z.string().describe('Device UDID'),
  fromX: z.number().describe('Start X coordinate'),
  fromY: z.number().describe('Start Y coordinate'),
  toX: z.number().describe('End X coordinate'),
  toY: z.number().describe('End Y coordinate'),
  duration: z.number().describe('Drag duration in seconds'),
})

const TypeTextSchema = z.object({
  udid: z.string().describe('Device UDID'),
  text: z.string().describe('Text to type'),
})

const GetScreenSizeSchema = z.object({
  udid: z.string().describe('Device UDID'),
})

const GetDeviceControlSizeSchema = z.object({
  udid: z.string().describe('Device UDID'),
})

const MarkCoordinatesSchema = z.object({
  udid: z.string().describe('Device UDID'),
  coordinates: z
    .array(
      z.object({
        x: z.number().describe('X coordinate in device control points'),
        y: z.number().describe('Y coordinate in device control points'),
      })
    )
    .min(1)
    .max(10)
    .describe(
      'Coordinates to mark (in device control point space, same as tap/drag)'
    ),
})

const TakeScreenshotSchema = z.object({
  udid: z.string().describe('Device UDID'),
})

const GoHomeSchema = z.object({
  udid: z.string().describe('Device UDID'),
})

const LockDeviceSchema = z.object({
  udid: z.string().describe('Device UDID'),
})

const UnlockDeviceSchema = z.object({
  udid: z.string().describe('Device UDID'),
})

const IsLockedSchema = z.object({
  udid: z.string().describe('Device UDID'),
})

const LaunchAppSchema = z.object({
  udid: z.string().describe('Device UDID'),
  bundleId: z
    .string()
    .describe('App bundle identifier (e.g. com.apple.mobilesafari)'),
})

const TerminateAppSchema = z.object({
  udid: z.string().describe('Device UDID'),
  bundleId: z.string().describe('App bundle identifier'),
})

const ListAppsSchema = z.object({
  udid: z.string().describe('Device UDID'),
})

const ListPhotosSchema = z.object({
  udid: z.string().describe('Device UDID'),
  limit: z
    .number()
    .optional()
    .describe('Number of photos to return (default: 50)'),
  cursor: z
    .string()
    .optional()
    .describe('Pagination cursor from a previous response'),
})

const DownloadPhotoSchema = z.object({
  udid: z.string().describe('Device UDID'),
  path: z
    .string()
    .describe(
      'Photo path on device (from list_photos, must start with /DCIM/)'
    ),
})

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

const OkOutputSchema = z.object({ ok: z.literal(true) })

const ListDevicesOutputSchema = z.object({
  devices: z.array(
    z.object({
      udid: z.string(),
      connected: z.boolean(),
      linked: z.boolean(),
      tunnelReady: z.boolean(),
      wdaState: z.string(),
      mainPort: z.number().optional(),
      mjpegPort: z.number().optional(),
    })
  ),
})

const DevicePrefsOutputSchema = z.object({
  alwaysAwake: z.boolean(),
})

const ScreenSizeOutputSchema = z.object({
  width: z.number(),
  height: z.number(),
})

const DeviceControlSizeOutputSchema = z.object({
  width: z.number(),
  height: z.number(),
})

const IsLockedOutputSchema = z.object({
  locked: z.boolean(),
})

const ListAppsOutputSchema = z.object({
  apps: z.array(
    z.object({
      bundleId: z.string(),
      name: z.string(),
    })
  ),
})

const ListPhotosOutputSchema = z.object({
  photos: z.array(
    z.object({
      path: z.string(),
      size: z.number(),
      modified: z.number(),
    })
  ),
  nextCursor: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const listDevices: ToolDefinition = {
  name: 'list_devices',
  description: 'List all connected iOS devices with their status',
  category: 'Device Management',
  inputSchema: ListDevicesSchema,
  outputSchema: ListDevicesOutputSchema,
  handler: async () => {
    const devices = deviceManager.getAllDevices()
    return textResult({ devices })
  },
}

const getDevicePrefsT: ToolDefinition = {
  name: 'get_device_prefs',
  description: 'Get preferences for a device (e.g. alwaysAwake setting)',
  category: 'Device Management',
  inputSchema: GetDevicePrefsSchema,
  outputSchema: DevicePrefsOutputSchema,
  handler: async ({ udid }) => {
    return textResult({ ...getDevicePrefs(udid) })
  },
}

const setDevicePrefsT: ToolDefinition = {
  name: 'set_device_prefs',
  description: 'Update preferences for a device',
  category: 'Device Management',
  inputSchema: SetDevicePrefsSchema,
  outputSchema: DevicePrefsOutputSchema,
  handler: async ({ udid, alwaysAwake }) => {
    setDevicePrefs(udid, { alwaysAwake })
    return textResult({ ...getDevicePrefs(udid) })
  },
}

const tap: ToolDefinition = {
  name: 'tap',
  category: 'Screen Interaction',
  description:
    'Tap at a coordinate on the device screen. Coordinates are in device control points (call get_device_control_size first, then mark_coordinates to visually verify the target before tapping).',
  inputSchema: TapSchema,
  outputSchema: OkOutputSchema,
  handler: async ({ udid, x, y }) => {
    const { mainPort, sessionId } = await ensureWda(udid)
    await wdaFetch(mainPort, 'POST', `/session/${sessionId}/actions`, {
      actions: [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            {
              type: 'pointerMove',
              duration: 0,
              x: Math.round(x),
              y: Math.round(y),
              origin: 'viewport',
            },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 50 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    })
    return textResult({ ok: true })
  },
}

const doubleTap: ToolDefinition = {
  name: 'double_tap',
  category: 'Screen Interaction',
  description:
    'Double-tap at a coordinate on the device screen. Coordinates are in device control points (call get_device_control_size first, then mark_coordinates to visually verify the target before double-tapping).',
  inputSchema: DoubleTapSchema,
  outputSchema: OkOutputSchema,
  handler: async ({ udid, x, y }) => {
    const { mainPort, sessionId } = await ensureWda(udid)
    await wdaFetch(mainPort, 'POST', `/session/${sessionId}/wda/doubleTap`, {
      x: Math.round(x),
      y: Math.round(y),
    })
    return textResult({ ok: true })
  },
}

const touchAndHold: ToolDefinition = {
  name: 'touch_and_hold',
  category: 'Screen Interaction',
  description:
    'Long-press at a coordinate on the device screen. Coordinates are in device control points (call get_device_control_size first, then mark_coordinates to visually verify the target before pressing).',
  inputSchema: TouchAndHoldSchema,
  outputSchema: OkOutputSchema,
  handler: async ({ udid, x, y, duration }) => {
    const { mainPort, sessionId } = await ensureWda(udid)
    await wdaFetch(mainPort, 'POST', `/session/${sessionId}/wda/touchAndHold`, {
      x: Math.round(x),
      y: Math.round(y),
      duration,
    })
    return textResult({ ok: true })
  },
}

const drag: ToolDefinition = {
  name: 'drag',
  category: 'Screen Interaction',
  description:
    'Drag (swipe) from one coordinate to another on the device screen. Coordinates are in device control points (call get_device_control_size first, then mark_coordinates to visually verify start and end points before dragging).',
  inputSchema: DragSchema,
  outputSchema: OkOutputSchema,
  handler: async ({ udid, fromX, fromY, toX, toY, duration }) => {
    const { mainPort, sessionId } = await ensureWda(udid)
    await wdaFetch(mainPort, 'POST', `/session/${sessionId}/actions`, {
      actions: [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            {
              type: 'pointerMove',
              duration: 0,
              x: Math.round(fromX),
              y: Math.round(fromY),
              origin: 'viewport',
            },
            { type: 'pointerDown', button: 0 },
            {
              type: 'pointerMove',
              duration: Math.round(duration * 1000),
              x: Math.round(toX),
              y: Math.round(toY),
              origin: 'viewport',
            },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    })
    return textResult({ ok: true })
  },
}

const typeText: ToolDefinition = {
  name: 'type_text',
  category: 'Screen Interaction',
  description:
    'Type text on the device (requires a focused text field). If you need to tap a text field first, follow the coordinate verification workflow: get_device_control_size → mark_coordinates → tap, then type_text.',
  inputSchema: TypeTextSchema,
  outputSchema: OkOutputSchema,
  handler: async ({ udid, text }) => {
    const { mainPort, sessionId } = await ensureWda(udid)
    await wdaFetch(mainPort, 'POST', `/session/${sessionId}/wda/keys`, {
      value: text.split(''),
    })
    return textResult({ ok: true })
  },
}

const getScreenSize: ToolDefinition = {
  name: 'get_screen_size',
  description: 'Get the device screen dimensions in points',
  category: 'Screen Interaction',
  inputSchema: GetScreenSizeSchema,
  outputSchema: ScreenSizeOutputSchema,
  handler: async ({ udid }) => {
    const { mainPort } = await ensureWda(udid)
    const value = await wdaFetch(mainPort, 'GET', '/window/size')
    return textResult(value as Record<string, unknown>)
  },
}

const takeScreenshot: ToolDefinition = {
  name: 'take_screenshot',
  description: 'Take a screenshot of the device screen (returns base64 PNG)',
  category: 'Screen Interaction',
  inputSchema: TakeScreenshotSchema,
  handler: async ({ udid }) => {
    const { mainPort, sessionId } = await ensureWda(udid)
    const base64 = (await wdaFetch(
      mainPort,
      'GET',
      `/session/${sessionId}/screenshot`
    )) as string
    return {
      content: [
        { type: 'image' as const, data: base64, mimeType: 'image/png' },
      ],
    }
  },
}

const goHome: ToolDefinition = {
  name: 'go_home',
  description: 'Press the home button / go to home screen',
  category: 'Device Control',
  inputSchema: GoHomeSchema,
  outputSchema: OkOutputSchema,
  handler: async ({ udid }) => {
    const { mainPort } = await ensureWda(udid)
    await wdaFetch(mainPort, 'POST', '/wda/homescreen')
    return textResult({ ok: true })
  },
}

const lockDevice: ToolDefinition = {
  name: 'lock_device',
  description: 'Lock the device screen',
  category: 'Device Control',
  inputSchema: LockDeviceSchema,
  outputSchema: OkOutputSchema,
  handler: async ({ udid }) => {
    const { mainPort } = await ensureWda(udid)
    await wdaFetch(mainPort, 'POST', '/wda/lock')
    return textResult({ ok: true })
  },
}

const unlockDevice: ToolDefinition = {
  name: 'unlock_device',
  description: 'Unlock the device screen',
  category: 'Device Control',
  inputSchema: UnlockDeviceSchema,
  outputSchema: OkOutputSchema,
  handler: async ({ udid }) => {
    const { mainPort } = await ensureWda(udid)
    await wdaFetch(mainPort, 'POST', '/wda/unlock')
    return textResult({ ok: true })
  },
}

const isLocked: ToolDefinition = {
  name: 'is_locked',
  description: 'Check if the device screen is locked',
  category: 'Device Control',
  inputSchema: IsLockedSchema,
  outputSchema: IsLockedOutputSchema,
  handler: async ({ udid }) => {
    const { mainPort } = await ensureWda(udid)
    const value = await wdaFetch(mainPort, 'GET', '/wda/locked')
    return textResult({ locked: value })
  },
}

const launchApp: ToolDefinition = {
  name: 'launch_app',
  description: 'Launch an app by bundle identifier',
  category: 'App Management',
  inputSchema: LaunchAppSchema,
  outputSchema: OkOutputSchema,
  handler: async ({ udid, bundleId }) => {
    const { mainPort, sessionId } = await ensureWda(udid)
    await wdaFetch(mainPort, 'POST', `/session/${sessionId}/wda/apps/launch`, {
      bundleId,
    })
    return textResult({ ok: true })
  },
}

const terminateApp: ToolDefinition = {
  name: 'terminate_app',
  description: 'Terminate a running app by bundle identifier',
  category: 'App Management',
  inputSchema: TerminateAppSchema,
  outputSchema: OkOutputSchema,
  handler: async ({ udid, bundleId }) => {
    const { mainPort, sessionId } = await ensureWda(udid)
    await wdaFetch(
      mainPort,
      'POST',
      `/session/${sessionId}/wda/apps/terminate`,
      {
        bundleId,
      }
    )
    return textResult({ ok: true })
  },
}

const listApps: ToolDefinition = {
  name: 'list_apps',
  description:
    'List installed apps on the device (User apps + curated System apps)',
  category: 'App Management',
  inputSchema: ListAppsSchema,
  outputSchema: ListAppsOutputSchema,
  handler: async ({ udid }) => {
    const filtered = await getFilteredApps(udid)
    return textResult({
      apps: filtered.map(app => ({
        bundleId: app.bundleId,
        name: app.bundleName ?? app.bundleId,
      })),
    })
  },
}

const listPhotos: ToolDefinition = {
  name: 'list_photos',
  description: 'List photos on the device camera roll with pagination',
  category: 'Photos',
  inputSchema: ListPhotosSchema,
  outputSchema: ListPhotosOutputSchema,
  handler: async ({ udid, limit, cursor }) => {
    const listResult = await photos.listPhotos(udid, {
      limit: limit ?? 50,
      cursor: cursor || undefined,
    })
    if (!listResult.success) {
      throw new Error(listResult.error.message)
    }

    const { photos: paths, nextCursor } = listResult.data
    const infoResults = await Promise.allSettled(
      paths.map(async p => {
        const info = await photos.getPhotoInfo(udid, p)
        if (!info.success) throw new Error(info.error.message)
        return { path: p, size: info.data.size, modified: info.data.modified }
      })
    )

    const entries = infoResults
      .filter(
        (
          r
        ): r is PromiseFulfilledResult<{
          path: string
          size: number
          modified: number
        }> => r.status === 'fulfilled'
      )
      .map(r => r.value)

    return textResult({ photos: entries, nextCursor: nextCursor ?? undefined })
  },
}

const downloadPhoto: ToolDefinition = {
  name: 'download_photo',
  description: 'Download a photo from the device and return it as base64',
  category: 'Photos',
  inputSchema: DownloadPhotoSchema,
  handler: async ({ udid, path: remotePath }) => {
    const { localPath, ext } = await downloadPhotoToCache(udid, remotePath)
    const { filePath, mimeExt } = await ensureCompatibleImage(localPath, ext)

    const base64 = Buffer.from(await Bun.file(filePath).arrayBuffer()).toString(
      'base64'
    )
    const mimeType = MEDIA_MIME_TYPES[mimeExt] ?? 'application/octet-stream'

    return {
      content: [{ type: 'image' as const, data: base64, mimeType }],
    }
  },
}

const getDeviceControlSize: ToolDefinition = {
  name: 'get_device_control_size',
  category: 'Screen Interaction',
  description:
    'Get the device control coordinate space. All coordinate-based tools use this range.',
  inputSchema: GetDeviceControlSizeSchema,
  outputSchema: DeviceControlSizeOutputSchema,
  handler: async ({ udid }) => {
    const { mainPort } = await ensureWda(udid)
    const value = await wdaFetch(mainPort, 'GET', '/window/size')
    return textResult(value as Record<string, unknown>)
  },
}

const markCoordinates: ToolDefinition = {
  name: 'mark_coordinates',
  category: 'Screen Interaction',
  description:
    'Visually verify coordinates before performing device control actions. Returns one annotated screenshot per coordinate. Each image has a full-screen crosshair: a horizontal line spanning the full width and a vertical line spanning the full height. The point where these two lines intersect is the EXACT coordinate that will be acted on. A small numbered badge sits at the intersection. Lines use per-pixel color negation for visibility. To verify: look ONLY at the intersection point and confirm it lands on the intended UI element.',
  inputSchema: MarkCoordinatesSchema,
  handler: async ({ udid, coordinates }) => {
    const { mainPort, sessionId } = await ensureWda(udid)

    const [windowSize, base64] = await Promise.all([
      wdaFetch(mainPort, 'GET', '/window/size') as Promise<{
        width: number
        height: number
      }>,
      wdaFetch(
        mainPort,
        'GET',
        `/session/${sessionId}/screenshot`
      ) as Promise<string>,
    ])

    const annotatedImages = await annotateScreenshot(
      base64,
      coordinates,
      windowSize
    )

    return {
      content: [
        {
          type: 'text' as const,
          text: 'Original screenshot (without markers):',
        },
        { type: 'image' as const, data: base64, mimeType: 'image/png' },
        ...annotatedImages.flatMap(({ full, crop }, idx) => [
          {
            type: 'text' as const,
            text: `Coordinate ${idx} (${coordinates[idx].x}, ${coordinates[idx].y}) — full crosshair:`,
          },
          { type: 'image' as const, data: full, mimeType: 'image/png' },
          {
            type: 'text' as const,
            text: `Coordinate ${idx} — close-up around intersection (this is what will be tapped):`,
          },
          { type: 'image' as const, data: crop, mimeType: 'image/png' },
        ]),
      ],
    }
  },
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const allTools: ToolDefinition[] = [
  listDevices,
  getDevicePrefsT,
  setDevicePrefsT,
  getDeviceControlSize,
  markCoordinates,
  tap,
  doubleTap,
  touchAndHold,
  drag,
  typeText,
  getScreenSize,
  takeScreenshot,
  goHome,
  lockDevice,
  unlockDevice,
  isLocked,
  launchApp,
  terminateApp,
  listApps,
  listPhotos,
  downloadPhoto,
]

export const toolMap = new Map(allTools.map(t => [t.name, t]))
