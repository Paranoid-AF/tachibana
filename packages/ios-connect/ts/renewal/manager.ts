/**
 * Renewal logic: check expiry, re-sign, re-install.
 * Uses the tbana-isideload daemon pipeline (auth + sign + install).
 */
import { install } from '../isideload/commands/install.ts'
import { findExpiring, addRecord } from './store.ts'
import { RenewalError } from '../errors.ts'
import type {
  SigningRecord,
  AppleCredentials,
  TwoFactorCallback,
  InstallProgressCallback,
} from '../types.ts'

/** Check for apps that need renewal */
export async function checkExpiring(
  thresholdDays: number = 1
): Promise<SigningRecord[]> {
  return findExpiring(thresholdDays)
}

/** Renew a single app using Sideloader install (handles auth + sign + install) */
export async function renewApp(
  record: SigningRecord,
  credentials: AppleCredentials,
  on2FA: TwoFactorCallback,
  onProgress?: InstallProgressCallback
): Promise<void> {
  onProgress?.({
    stage: 'install',
    message: `Renewing ${record.appBundleId} via Sideloader...`,
  })

  const result = await install(record.ipaPath, {
    credentials,
    on2FA,
    udid: record.deviceUdid,
  })

  if (!result.success) {
    throw new RenewalError(
      `Failed to renew: ${result.error.message}`,
      record.appBundleId
    )
  }

  // Update record with new renewal timestamp
  await addRecord({
    ...record,
    lastRenewedAt: new Date().toISOString(),
  })
}

/** Renew all expiring apps. */
export async function renewAll(
  credentials: AppleCredentials,
  on2FA: TwoFactorCallback,
  options?: { thresholdDays?: number; onProgress?: InstallProgressCallback }
): Promise<{
  renewed: string[]
  failed: Array<{ bundleId: string; error: string }>
}> {
  const thresholdDays = options?.thresholdDays ?? 1
  const expiring = await findExpiring(thresholdDays)

  if (expiring.length === 0) {
    return { renewed: [], failed: [] }
  }

  const renewed: string[] = []
  const failed: Array<{ bundleId: string; error: string }> = []

  for (const record of expiring) {
    try {
      await renewApp(record, credentials, on2FA, options?.onProgress)
      renewed.push(record.appBundleId)
    } catch (err) {
      failed.push({
        bundleId: record.appBundleId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { renewed, failed }
}
