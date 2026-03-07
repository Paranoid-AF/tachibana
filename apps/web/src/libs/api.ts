import { treaty } from '@elysiajs/eden'
import type { App } from '@tachibana/server'

export const api = treaty<App>(window.location.origin).api
