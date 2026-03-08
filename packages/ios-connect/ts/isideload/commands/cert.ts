import type {
  SideloaderOptions,
  SideloaderResult,
  DevelopmentCert,
} from '../../types.ts'
import { getSession } from '../session.ts'
import { ensureSession } from './auth.ts'

/** List development certificates */
export async function list(
  options?: SideloaderOptions
): Promise<SideloaderResult<DevelopmentCert[]>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const session = getSession()
    const certs = await session.listCerts(options?.teamId)
    return { success: true, data: certs }
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

/** Revoke a certificate by serial number */
export async function revoke(
  serialNumber: string,
  options?: SideloaderOptions
): Promise<SideloaderResult<string>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const session = getSession()
    await session.revokeCert(serialNumber, options?.teamId)
    return { success: true, data: 'Certificate revoked' }
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
