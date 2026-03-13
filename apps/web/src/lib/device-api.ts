import type { DeviceListResponseItem, SessionInfo } from '@/types'

export async function fetchDevices(): Promise<DeviceListResponseItem[]> {
  const res = await fetch('/api/devices')
  if (!res.ok) throw new Error('Failed to fetch devices')
  return res.json()
}

export async function fetchSessionInfo(): Promise<SessionInfo> {
  const res = await fetch('/api/apple-account')
  if (!res.ok) throw new Error('Failed to fetch session')
  return res.json()
}

export async function linkDevice(udid: string, name: string): Promise<void> {
  const friendlyMessageMap: Record<string, string> = {
    'Pairing failed: this request was prohibited':
      'Device has to be connected via USB.',
    'Pairing failed: user denied pairing trust':
      'You might just tapped "Don\'t Trust" on device. Please unplug it and plug back in, then try linking again.',
  }
  const res = await fetch(`/api/devices/${udid}/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const message = body?.message ?? 'Reason unknown.'
    const friendlyMessage = friendlyMessageMap[message] ?? message
    throw new Error(friendlyMessage)
  }
}
