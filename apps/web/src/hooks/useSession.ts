import { useQuery } from '@tanstack/react-query'

import { fetchSessionInfo } from '@/libs/deviceApi'
import type { SessionInfo } from '@/types'

export function useSession() {
  return useQuery<SessionInfo>({
    queryKey: ['auth/session'],
    queryFn: fetchSessionInfo,
    refetchInterval: 5000,
  })
}
