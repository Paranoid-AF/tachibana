import type { MergedDeviceInfo, SessionInfo } from '@/types'

export async function fetchDevices(): Promise<MergedDeviceInfo[]> {
  const res = await fetch('/api/devices')
  if (!res.ok) throw new Error('Failed to fetch devices')
  return res.json()
}

export async function fetchSessionInfo(): Promise<SessionInfo> {
  const res = await fetch('/api/auth/session')
  if (!res.ok) throw new Error('Failed to fetch session')
  return res.json()
}

export async function linkDevice(udid: string, name: string): Promise<void> {
  const res = await fetch(`/api/devices/${udid}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.message ?? 'Failed to link device')
  }
}
