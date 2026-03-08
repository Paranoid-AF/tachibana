import { useQuery } from '@tanstack/react-query'

import { fetchDevices } from '@/libs/deviceApi'
import type { MergedDeviceInfo } from '@/types'

export function useDevices(options?: { enabled?: boolean }) {
  return useQuery<MergedDeviceInfo[]>({
    queryKey: ['devices'],
    queryFn: fetchDevices,
    refetchInterval: 3000,
    enabled: options?.enabled ?? true,
  })
}
