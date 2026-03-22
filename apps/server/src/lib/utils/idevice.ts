import { tmpdir } from 'os'
import { join, extname } from 'path'
import { mkdirSync, existsSync } from 'fs'
import convert from 'heic-convert'

import { apps, photos } from '@tbana/ios-connect'

import { deviceManager } from '../../service/device/manager.ts'
import { wdaManager } from '../../service/wda-manager.ts'
import { getConfig } from '../config.ts'
import {
  VISIBLE_SYSTEM_APPS,
  PHOTO_CACHE_DIR_NAME,
} from '../../const/idevice.ts'

/**
 * Ensure WDA is running for a device and return its ports.
 * Throws if device is not found or WDA fails to start.
 */
export async function ensureWdaPorts(
  udid: string
): Promise<{ mainPort: number; mjpegPort: number | undefined }> {
  const entry = deviceManager.getDevice(udid)
  if (!entry || !entry.connected) {
    throw new Error(`Device ${udid} not found or disconnected`)
  }

  let mainPort = entry.wdaState === 'ready' ? entry.mainPort : undefined
  let mjpegPort = entry.wdaState === 'ready' ? entry.mjpegPort : undefined

  if (mainPort) {
    // Quick validation: check if the WDA HTTP port is actually reachable
    try {
      const res = await fetch(`http://localhost:${mainPort}/status`, {
        signal: AbortSignal.timeout(3_000),
      })
      if (!res.ok) throw new Error('non-ok status')
    } catch {
      // WDA is in broken "ready" state — trigger restart and wait
      console.log(
        `[ensureWdaPorts] WDA for ${udid.slice(-8)} is unresponsive, triggering restart`
      )
      await wdaManager.restart(udid)
      await deviceManager.waitUntilReady(udid)
      const refreshed = deviceManager.getDevice(udid)
      mainPort = refreshed?.mainPort ?? wdaManager.getState(udid).mainPort
      mjpegPort = refreshed?.mjpegPort
    }
  }

  if (!mainPort) {
    wdaManager.prepare(udid)
    await deviceManager.waitUntilReady(udid)
    const refreshed = deviceManager.getDevice(udid)
    mainPort = refreshed?.mainPort ?? wdaManager.getState(udid).mainPort
    mjpegPort = refreshed?.mjpegPort
  }

  if (!mainPort) {
    throw new Error('WDA started but mainPort is unavailable')
  }

  return { mainPort, mjpegPort }
}

/**
 * List installed apps filtered to user apps + curated system apps,
 * excluding the WDA bundle.
 */
export async function getFilteredApps(
  udid: string
): Promise<Array<{ bundleId: string; bundleName: string | null }>> {
  const [userResult, systemResult] = await Promise.all([
    apps.listInstalledApps(udid, 'User'),
    apps.listInstalledApps(udid, 'System'),
  ])
  if (!userResult.success) {
    throw new Error(userResult.error.message)
  }

  const systemApps = systemResult.success
    ? systemResult.data.filter(app => VISIBLE_SYSTEM_APPS.has(app.bundleId))
    : []

  const config = await getConfig()
  const wdaBundleId = config.wda.bundleId
  const allApps = [...userResult.data, ...systemApps]

  return allApps
    .filter(app => !wdaBundleId || !app.bundleId.startsWith(wdaBundleId))
    .map(app => ({ bundleId: app.bundleId, bundleName: app.bundleName }))
}

/**
 * Download a photo from the device to a local cache directory.
 * Validates path security and skips download if already cached.
 */
export async function downloadPhotoToCache(
  udid: string,
  remotePath: string
): Promise<{ localPath: string; ext: string }> {
  if (!remotePath.startsWith('/DCIM/') || remotePath.includes('..')) {
    throw new Error('Only /DCIM/ paths are allowed')
  }

  const cacheDir = join(tmpdir(), PHOTO_CACHE_DIR_NAME, udid)
  const ext = extname(remotePath).toLowerCase()
  const hash = new Bun.CryptoHasher('sha256').update(remotePath).digest('hex')
  const localPath = join(cacheDir, `${hash}${ext}`)

  if (!existsSync(localPath)) {
    mkdirSync(cacheDir, { recursive: true })
    const result = await photos.downloadPhoto(udid, remotePath, localPath)
    if (!result.success) {
      throw new Error(result.error.message)
    }
  }

  return { localPath, ext }
}

/**
 * If the file is HEIC, convert to JPEG and return the converted path.
 * Otherwise return the original path and its MIME-appropriate extension.
 * Caches the converted JPEG alongside the original as `.preview.jpg`.
 */
export async function ensureCompatibleImage(
  localPath: string,
  ext: string
): Promise<{ filePath: string; mimeExt: string }> {
  if (ext !== '.heic') {
    return { filePath: localPath, mimeExt: ext }
  }

  const jpegPath = localPath.slice(0, -ext.length) + '.preview.jpg'
  if (!existsSync(jpegPath)) {
    const inputBuffer = await Bun.file(localPath).arrayBuffer()
    const outputBuffer = await convert({
      buffer: Buffer.from(inputBuffer) as unknown as ArrayBufferLike,
      format: 'JPEG',
      quality: 0.85,
    })
    await Bun.write(jpegPath, outputBuffer)
  }

  return { filePath: jpegPath, mimeExt: '.jpg' }
}
