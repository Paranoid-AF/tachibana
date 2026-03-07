import type { SideloaderResult } from '../../types.ts'
import { getDaemon } from '../daemon.ts'

export interface PhotoEntry {
  path: string
  size: number
  modified: number
}

/** List all photos and videos in the device's DCIM folder */
export async function listPhotos(
  udid: string
): Promise<SideloaderResult<PhotoEntry[]>> {
  try {
    const daemon = await getDaemon()
    const result = await daemon.request<{ photos: PhotoEntry[] }>('listPhotos', { udid })
    return { success: true, data: result.photos }
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

/** Download a single photo from the device to a local path */
export async function downloadPhoto(
  udid: string,
  remotePath: string,
  localDest: string
): Promise<SideloaderResult<{ dest: string; bytesWritten: number }>> {
  try {
    const daemon = await getDaemon()
    const result = await daemon.request<{ dest: string; bytesWritten: number }>(
      'downloadPhoto',
      { udid, remotePath, localDest }
    )
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
