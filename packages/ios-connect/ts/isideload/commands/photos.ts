import type { SideloaderResult } from '../../types.ts'
import { getSession } from '../session.ts'

export interface PhotoInfo {
  size: number
  modified: number
}

export interface ListPhotosOptions {
  limit?: number
  cursor?: string
}

export interface ListPhotosPage {
  photos: string[]
  nextCursor: string | null
}

/**
 * List photos and videos in the device's DCIM folder, newest first.
 * Results are paginated. Pass `nextCursor` from the previous response as
 * `cursor` to fetch the next page. `nextCursor` is null when all photos
 * have been listed.
 */
export async function listPhotos(
  udid: string,
  options?: ListPhotosOptions
): Promise<SideloaderResult<ListPhotosPage>> {
  try {
    const session = getSession()
    const result = await session.listPhotos(udid, options?.limit, options?.cursor)
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

/** Get size and modification timestamp for a single photo path */
export async function getPhotoInfo(
  udid: string,
  path: string
): Promise<SideloaderResult<PhotoInfo>> {
  try {
    const session = getSession()
    const result = await session.getPhotoInfo(udid, path)
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

/** Download a single photo from the device to a local path */
export async function downloadPhoto(
  udid: string,
  remotePath: string,
  localDest: string
): Promise<SideloaderResult<{ dest: string; bytesWritten: number }>> {
  try {
    const session = getSession()
    const result = await session.downloadPhoto(udid, remotePath, localDest)
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
