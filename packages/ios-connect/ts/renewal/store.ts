/**
 * Persists signing state to ~/.tbana/signing-state.json.
 * Tracks which apps were signed, with which certs, for renewal.
 */
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SigningRecord, SigningState } from '../types.ts'

const STATE_DIR = join(homedir(), '.tbana')
const STATE_FILE = join(STATE_DIR, 'signing-state.json')

async function ensureDir(): Promise<void> {
  await mkdir(STATE_DIR, { recursive: true })
}

/** Load signing state from disk */
export async function loadState(): Promise<SigningState> {
  try {
    const data = await Bun.file(STATE_FILE).text()
    return JSON.parse(data) as SigningState
  } catch {
    return { records: [] }
  }
}

/** Save signing state to disk */
export async function saveState(state: SigningState): Promise<void> {
  await ensureDir()
  await Bun.write(STATE_FILE, JSON.stringify(state, null, 2))
}

/** Add or update a signing record */
export async function addRecord(record: SigningRecord): Promise<void> {
  const state = await loadState()
  const idx = state.records.findIndex(
    r =>
      r.appBundleId === record.appBundleId && r.deviceUdid === record.deviceUdid
  )

  if (idx >= 0) {
    state.records[idx] = record
  } else {
    state.records.push(record)
  }

  await saveState(state)
}

/** Remove a signing record */
export async function removeRecord(
  appBundleId: string,
  deviceUdid: string
): Promise<void> {
  const state = await loadState()
  state.records = state.records.filter(
    r => !(r.appBundleId === appBundleId && r.deviceUdid === deviceUdid)
  )
  await saveState(state)
}

/** Get all signing records */
export async function getRecords(): Promise<SigningRecord[]> {
  const state = await loadState()
  return state.records
}

/** Find records expiring within the given threshold (days) */
export async function findExpiring(
  thresholdDays: number = 1
): Promise<SigningRecord[]> {
  const state = await loadState()
  const threshold = Date.now() + thresholdDays * 24 * 60 * 60 * 1000

  return state.records.filter(r => {
    const expiresAt = new Date(r.certExpiresAt).getTime()
    return expiresAt <= threshold
  })
}
