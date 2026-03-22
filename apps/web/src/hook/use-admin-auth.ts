import { useQuery } from '@tanstack/react-query'

import {
  fetchAdminAuthStatus,
  type AdminAuthStatus,
} from '@/lib/admin-auth-api'

export function useAdminAuth() {
  return useQuery<AdminAuthStatus>({
    queryKey: ['admin/status'],
    queryFn: fetchAdminAuthStatus,
    staleTime: 30_000,
    refetchInterval: false,
  })
}
