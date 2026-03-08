import type { SideloaderResult } from '../../types.ts'
import { getNative } from '../native.ts'

export interface TunnelResult {
  localPort: number
}

/** Start a USB tunnel to a device port (e.g., WDA port 8100). Returns the local port. */
export async function startTunnel(
  udid: string,
  remotePort: number
): Promise<SideloaderResult<TunnelResult>> {
  try {
    const localPort = await getNative().startTunnel(udid, remotePort)
    return { success: true, data: { localPort } }
  } catch (err) {
    return {
      success: false,
      error: { code: 'TUNNEL_ERROR', message: String(err) },
    }
  }
}

/** Stop a running tunnel by its local port number. */
export async function stopTunnel(
  localPort: number
): Promise<SideloaderResult<void>> {
  try {
    await getNative().stopTunnel(localPort)
    return { success: true, data: undefined }
  } catch (err) {
    return {
      success: false,
      error: { code: 'TUNNEL_STOP_ERROR', message: String(err) },
    }
  }
}
