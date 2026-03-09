import { useQuery } from '@tanstack/react-query'

import { fetchDevices } from '@/lib/device-api'
import type { DeviceListResponseItem } from '@/types'

export function useDevices(options?: { enabled?: boolean }) {
  return useQuery<DeviceListResponseItem[]>({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    refetchInterval: 3000,
    enabled: options?.enabled ?? true,
  })
}
