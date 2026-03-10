import type {
  SideloaderOptions,
  SideloaderResult,
  DeveloperTeam,
} from '../../types.ts'
import { getSession } from '../session.ts'
import { ensureSession } from './auth.ts'

/** List developer teams */
export async function list(
  options?: SideloaderOptions
): Promise<SideloaderResult<DeveloperTeam[]>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const session = await getSession()
    const teams = await session.listTeams()
    return { success: true, data: teams }
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
