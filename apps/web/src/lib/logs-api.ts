export interface DeviceLog {
  id: number
  udid: string
  authId: number | null
  source: string // 'web' | 'agent' | 'mcp'
  action: string
  params: string | null
  status: string // 'processing' | 'success' | 'failed'
  error: string | null
  createdAt: number
  completedAt: number | null
}

export interface DeviceLogsResponse {
  logs: DeviceLog[]
  total: number
}

export async function fetchDeviceLogs(
  udid: string,
  page: number,
  pageSize: number
): Promise<DeviceLogsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  })
  const res = await fetch(`/api/devices/${udid}/logs?${params}`)
  if (!res.ok) throw new Error('Failed to fetch device logs')
  return res.json()
}
