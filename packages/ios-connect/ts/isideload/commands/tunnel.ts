import type { SideloaderResult } from '../../types.ts'

export interface TunnelResult {
  localPort: number
}

/** Start a USB tunnel to a device port (e.g., WDA port 8100) */
export async function startTunnel(
  _udid: string,
  _remotePort: number
): Promise<SideloaderResult<TunnelResult>> {
  return {
    success: false,
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'USB tunneling is not yet implemented in the native addon',
    },
  }
}
