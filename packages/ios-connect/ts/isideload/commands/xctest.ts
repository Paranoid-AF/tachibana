import type { SideloaderResult } from '../../types.ts'
import { getNative } from '../native.ts'

export interface XCTestSession {
  sessionId: number
}

/** Start an XCUITest session on a connected device (iOS 17+, cross-platform).
 *  Handles testmanagerd protocol, launches the test runner, and starts the test plan.
 *  Returns a session ID — the session stays alive until `stopXCUITest` is called. */
export async function startXCUITest(
  udid: string,
  bundleId: string,
  testRunnerBundleId: string,
  env?: Record<string, string>
): Promise<SideloaderResult<XCTestSession>> {
  try {
    const sessionId = await getNative().startXcuitest(
      udid,
      bundleId,
      testRunnerBundleId,
      env ?? undefined
    )
    return { success: true, data: { sessionId } }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'XCTEST_START_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}

/** Stop a running XCUITest session. */
export async function stopXCUITest(
  sessionId: number
): Promise<SideloaderResult<void>> {
  try {
    await getNative().stopXcuitest(sessionId)
    return { success: true, data: undefined }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'XCTEST_STOP_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    }
  }
}
