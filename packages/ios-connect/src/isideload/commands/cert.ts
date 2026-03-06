import type {
  SideloaderOptions,
  SideloaderResult,
  DevelopmentCert,
} from '../../types.ts'
import { getDaemon } from '../daemon.ts'
import { ensureSession } from './auth.ts'

/** List development certificates */
export async function list(
  options?: SideloaderOptions
): Promise<SideloaderResult<DevelopmentCert[]>> {
  try {
    const auth = await ensureSession(options)
    if (!auth.success) return auth

    const daemon = await getDaemon()
    const result = await daemon.request<{ certs: DevelopmentCert[] }>(
      'listCerts',
      {}
    )
    return { success: true, data: result.certs }
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

    const daemon = await getDaemon()
    await daemon.request('revokeCert', { serialNumber })
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
