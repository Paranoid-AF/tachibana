import type {
  SideloaderOptions,
  SideloaderResult,
  DeveloperTeam,
} from '../../types.ts'
import { getDaemon } from '../daemon.ts'
import { ensureSession } from './auth.ts'

/** List developer teams */
export async function list(
  options?: SideloaderOptions
): Promise<SideloaderResult<DeveloperTeam[]>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const daemon = await getDaemon()
    const result = await daemon.request<{ teams: DeveloperTeam[] }>('listTeams')
    return { success: true, data: result.teams }
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
