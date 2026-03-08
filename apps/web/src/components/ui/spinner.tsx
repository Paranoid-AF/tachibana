import { Loader2 } from 'lucide-react'

import { cn } from '@/libs/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin', className)} />
}
