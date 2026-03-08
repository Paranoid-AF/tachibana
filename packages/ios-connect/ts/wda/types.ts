/** W3C WebDriver capabilities */
export interface SessionCapabilities {
  bundleId?: string
  [key: string]: unknown
}

/** Device capabilities returned from session creation */
export interface DeviceCapabilities {
  device?: string
  browserName?: string
  sdkVersion?: string
  CFBundleIdentifier?: string
  [key: string]: unknown
}

/** WDA /status response */
export interface WdaStatus {
  ready: boolean
  message?: string
  sessionId?: string
  [key: string]: unknown
}

/** WebDriver error response */
export interface WebDriverError {
  error: string
  message: string
  stacktrace?: string
}

/** Element location strategy */
export type ElementStrategy =
  | 'accessibility id'
  | 'xpath'
  | 'class name'
  | 'name'
  | 'id'
  | '-ios predicate string'
  | '-ios class chain'
