import type {
  SessionCapabilities,
  DeviceCapabilities,
  WdaStatus,
  ElementStrategy,
} from './types.ts'

/**
 * WDA HTTP client implementing W3C WebDriver protocol.
 * Communicates with WebDriverAgent running on an iOS device via a USB tunnel.
 */
export class WdaClient {
  private baseUrl: string
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  // ── Health check ──

  /** Check if WDA is ready (no session required) */
  async getStatus(): Promise<WdaStatus> {
    return this.get('/status')
  }

  // ── Session lifecycle ──

  /** Create a new WebDriver session */
  async createSession(
    capabilities?: SessionCapabilities
  ): Promise<{ sessionId: string; capabilities: DeviceCapabilities }> {
    const body = {
      capabilities: {
        alwaysMatch: capabilities ?? {},
      },
    }
    const res = await this.post<{
      sessionId: string
      capabilities: DeviceCapabilities
    }>('/session', body)
    return res
  }

  /** Delete a session */
  async deleteSession(sessionId: string): Promise<void> {
    await this.delete(`/session/${sessionId}`)
  }

  // ── Screenshots ──

  /** Take a screenshot, returns base64-decoded PNG buffer */
  async screenshot(sessionId: string): Promise<Buffer> {
    const res = await this.get<string>(`/session/${sessionId}/screenshot`)
    return Buffer.from(res, 'base64')
  }

  // ── App lifecycle ──

  /** Launch an app by bundle ID */
  async launchApp(sessionId: string, bundleId: string): Promise<void> {
    await this.post(`/session/${sessionId}/wda/apps/launch`, { bundleId })
  }

  /** Terminate an app by bundle ID */
  async terminateApp(sessionId: string, bundleId: string): Promise<void> {
    await this.post(`/session/${sessionId}/wda/apps/terminate`, { bundleId })
  }

  // ── Device info ──

  /** Get device info from session capabilities */
  async getDeviceInfo(sessionId: string): Promise<DeviceCapabilities> {
    // WDA returns device info as part of session capabilities
    return this.get(`/session/${sessionId}`)
  }

  // ── Element interaction ──

  /** Find an element using the given strategy */
  async findElement(
    sessionId: string,
    using: ElementStrategy,
    value: string
  ): Promise<string> {
    const res = await this.post<{ ELEMENT: string }>(
      `/session/${sessionId}/element`,
      { using, value }
    )
    // WebDriver returns element ID in ELEMENT key or as first value
    return res.ELEMENT ?? Object.values(res)[0]
  }

  /** Tap/click an element */
  async tapElement(sessionId: string, elementId: string): Promise<void> {
    await this.post(`/session/${sessionId}/element/${elementId}/click`, {})
  }

  /** Get element text */
  async getElementText(sessionId: string, elementId: string): Promise<string> {
    return this.get(`/session/${sessionId}/element/${elementId}/text`)
  }

  /** Send keys to an element */
  async sendKeys(
    sessionId: string,
    elementId: string,
    text: string
  ): Promise<void> {
    await this.post(`/session/${sessionId}/element/${elementId}/value`, {
      text,
      value: text.split(''),
    })
  }

  /** Get page source (XML) */
  async getPageSource(sessionId: string): Promise<string> {
    return this.get(`/session/${sessionId}/source`)
  }

  // ── HTTP helpers ──

  private async get<T = unknown>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`)
    return this.handleResponse<T>(res)
  }

  private async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return this.handleResponse<T>(res)
  }

  private async delete(path: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'DELETE' })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`WDA request failed: ${res.status} ${text}`)
    }
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    const json = (await res.json()) as { value: T; status?: number }
    if (!res.ok || (json.status !== undefined && json.status !== 0)) {
      const error = json.value as unknown as {
        error?: string
        message?: string
      }
      throw new Error(
        `WDA error: ${error?.error ?? res.status} - ${error?.message ?? 'Unknown error'}`
      )
    }
    return json.value
  }
}
