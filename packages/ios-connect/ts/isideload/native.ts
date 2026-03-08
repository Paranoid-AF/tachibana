import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const _require = createRequire(import.meta.url)

// Raw types returned by napi-rs (matches the Rust serde_json::Value shapes)
export interface ConnectedDeviceRaw {
  udid: string
  name: string
  productType: string
  productVersion: string
}

export interface TeamRaw {
  teamId: string
  name: string
  type: string
  status: string
}

export interface CertRaw {
  serialNumber: string
  name: string
  expirationDate: string | null
}

export interface AppIdRaw {
  appIdId: string
  name: string
  identifier: string
}

export interface DeviceRaw {
  udid: string
  name: string
  status: string
}

export interface SessionInfoRaw {
  loggedIn: boolean
  email: string | null
}

export interface ListPhotosResultRaw {
  photos: string[]
  nextCursor: string | null
}

export interface PhotoInfoRaw {
  size: number
  modified: number
}

export interface DownloadPhotoResultRaw {
  dest: string
  bytesWritten: number
}

export interface NativeSession {
  login(
    email: string,
    password: string,
    twoFaCallback: (info: { type: string }) => Promise<string>
  ): Promise<void>
  getSessionInfo(): Promise<SessionInfoRaw>
  listTeams(): Promise<TeamRaw[]>
  listCerts(teamId?: string | null): Promise<CertRaw[]>
  revokeCert(serialNumber: string, teamId?: string | null): Promise<void>
  listAppIds(teamId?: string | null): Promise<AppIdRaw[]>
  createAppId(
    bundleId: string,
    name: string,
    teamId?: string | null
  ): Promise<AppIdRaw>
  listDevices(teamId?: string | null): Promise<DeviceRaw[]>
  registerDevice(
    udid: string,
    name: string,
    teamId?: string | null
  ): Promise<void>
  signApp(appPath: string, teamId?: string | null): Promise<string>
  installApp(
    appPath: string,
    udid: string,
    teamId?: string | null
  ): Promise<void>
  listPhotos(
    udid: string,
    limit?: number | null,
    cursor?: string | null
  ): Promise<ListPhotosResultRaw>
  getPhotoInfo(udid: string, path: string): Promise<PhotoInfoRaw>
  downloadPhoto(
    udid: string,
    remotePath: string,
    localDest: string
  ): Promise<DownloadPhotoResultRaw>
  pairDevice(udid: string): Promise<boolean>
  validatePairing(udid: string): Promise<boolean>
}

export type NativeSessionConstructor = new (
  dataDir: string,
  anisetteUrl?: string | null
) => NativeSession

export interface NativeAddon {
  Session: NativeSessionConstructor
  listConnectedDevices(): Promise<ConnectedDeviceRaw[]>
  screenshot(udid: string, outputPath: string): Promise<string>
}

let _native: NativeAddon | null = null

/**
 * Load the napi-rs generated native addon.
 * The @napi-rs/cli build command places `index.js` (a platform-aware loader)
 * in dist/ alongside the platform `.node` file.
 */
export function getNative(): NativeAddon {
  if (_native) return _native
  // Package root is two levels up from ts/isideload/
  const pkgRoot = join(dirname(import.meta.dirname!), '..')
  _native = _require(join(pkgRoot, 'dist', 'index.js')) as NativeAddon
  return _native
}
