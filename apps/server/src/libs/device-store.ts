import { homedir } from 'os'
import { join, dirname } from 'path'
import { mkdir } from 'fs/promises'

export interface DeviceMeta {
  name: string
  productType: string
  productVersion: string
}

function getDeviceStorePath(): string {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? homedir()
    return join(appData, 'tachibana', 'devices.json')
  }
  return join(homedir(), '.local', 'state', 'tachibana', 'devices.json')
}

async function readStore(): Promise<Record<string, DeviceMeta>> {
  try {
    const text = await Bun.file(getDeviceStorePath()).text()
    return JSON.parse(text) as Record<string, DeviceMeta>
  } catch {
    return {}
  }
}

export async function getDeviceMeta(udid: string): Promise<DeviceMeta | null> {
  const store = await readStore()
  return store[udid] ?? null
}

export async function saveDeviceMeta(
  udid: string,
  meta: DeviceMeta
): Promise<void> {
  const store = await readStore()
  store[udid] = meta
  const path = getDeviceStorePath()
  await mkdir(dirname(path), { recursive: true })
  await Bun.write(path, JSON.stringify(store, null, 2))
}
