import { treaty } from '@elysiajs/eden'
import type { App } from '@tbana/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const api: ReturnType<typeof treaty<App>>['api'] = (
  treaty<App>(window.location.origin) as any
).api
