import type { SideloaderResult } from '../../types.ts'
import { getDaemon } from '../daemon.ts'

export interface TunnelResult {
  localPort: number
}

/** Start a USB tunnel to a device port (e.g., WDA port 8100) */
export async function startTunnel(
  udid: string,
  remotePort: number
): Promise<SideloaderResult<TunnelResult>> {
  try {
    const daemon = await getDaemon()
    const result = await daemon.request<TunnelResult>('startTunnel', {
      udid,
      remotePort,
    })
    return { success: true, data: result }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'COMMAND_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}
