/**
 * Periodic renewal scheduler.
 * Runs renewal checks at configurable intervals (default: every 12 hours).
 */
import { renewAll, checkExpiring } from './manager.ts'
import type { SchedulerOptions, RenewalEvent } from '../types.ts'

const DEFAULT_INTERVAL_HOURS = 12
const DEFAULT_THRESHOLD_DAYS = 1

/** Start the renewal scheduler. Returns a stop function. */
export function startRenewalScheduler(options: SchedulerOptions): {
  stop: () => void
} {
  const intervalMs =
    (options.intervalHours ?? DEFAULT_INTERVAL_HOURS) * 60 * 60 * 1000
  const thresholdDays = options.thresholdDays ?? DEFAULT_THRESHOLD_DAYS
  const onEvent = options.onEvent

  function emit(event: RenewalEvent): void {
    onEvent?.(event)
  }

  async function runCheck(): Promise<void> {
    try {
      const expiring = await checkExpiring(thresholdDays)
      if (expiring.length === 0) {
        emit({ type: 'renewal:skip' })
        return
      }

      emit({ type: 'renewal:start' })

      const { renewed, failed } = await renewAll(
        options.credentials,
        options.on2FA,
        { thresholdDays }
      )

      for (const bundleId of renewed) {
        const record = expiring.find(r => r.appBundleId === bundleId)
        emit({ type: 'renewal:success', record })
      }

      for (const { bundleId, error } of failed) {
        const record = expiring.find(r => r.appBundleId === bundleId)
        emit({
          type: 'renewal:error',
          record,
          error: new Error(error),
        })
      }
    } catch (err) {
      emit({
        type: 'renewal:error',
        error: err instanceof Error ? err : new Error(String(err)),
      })
    }
  }

  // Run initial check
  runCheck()

  // Set up interval
  const interval = setInterval(runCheck, intervalMs)

  return {
    stop: () => {
      clearInterval(interval)
    },
  }
}
