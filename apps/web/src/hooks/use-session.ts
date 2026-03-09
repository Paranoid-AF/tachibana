import { useQuery } from '@tanstack/react-query'

import { fetchSessionInfo } from '@/lib/device-api'
import type { SessionInfo } from '@/types'

export function useSession() {
  return useQuery<SessionInfo>({
    queryKey: ['auth/session'],
    queryFn: fetchSessionInfo,
    refetchInterval: 5000,
  })
}
