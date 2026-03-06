/**
 * IPA resolution result
 */
export interface WdaResolution {
  /** Resolved file path */
  path: string
  /** Resolution source */
  source: 'env' | 'bundled'
}

/**
 * Xcode availability information
 */
export interface XcodeInfo {
  available: boolean
  version?: number
  tooOld?: boolean
}

/**
 * WDA version metadata
 */
export interface WdaVersionInfo {
  wdaVersion: string
  builtAt: string
  xcodeVersion?: string
}
