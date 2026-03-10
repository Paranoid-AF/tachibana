import { WdaClient } from './client.ts'
import type { WdaStatus } from './types.ts'

const HEALTH_CHECK_TIMEOUT_MS = 5_000

/**
 * Managed WDA session: handles creation, health checks, and cleanup.
 */
export class WdaSession {
  private sessionId: string | null = null
  private client: WdaClient

  constructor(client: WdaClient) {
    this.client = client
  }

  /** Check if WDA is healthy and ready */
  async isHealthy(): Promise<boolean> {
    try {
      const status: WdaStatus = await this.client.getStatus(
        HEALTH_CHECK_TIMEOUT_MS
      )
      return status.ready
    } catch {
      return false
    }
  }

  /** Create a session (or return existing) */
  async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId

    const result = await this.client.createSession()
    this.sessionId = result.sessionId
    return this.sessionId
  }

  /** Get current session ID (null if not created) */
  getSessionId(): string | null {
    return this.sessionId
  }

  /** Destroy the current session */
  async destroy(): Promise<void> {
    if (!this.sessionId) return
    try {
      await this.client.deleteSession(this.sessionId)
    } catch {
      // Session may have already expired
    }
    this.sessionId = null
  }
}
