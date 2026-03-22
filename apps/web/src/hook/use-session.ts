import { useQuery } from '@tanstack/react-query'

import { fetchSessionInfo } from '@/api/device-api'
import type { SessionInfo } from '@/types'

export function useSession() {
  return useQuery<SessionInfo>({
    queryKey: ['apple-account/session'],
    queryFn: fetchSessionInfo,
    refetchInterval: 5000,
  })
}
