/**
 * Base error for ios-wda package
 */
export class WdaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WdaError'
  }
}

/**
 * Thrown when WDA IPA cannot be found
 */
export class WdaIpaNotFoundError extends WdaError {
  constructor(message: string) {
    super(message)
    this.name = 'WdaIpaNotFoundError'
  }
}

/**
 * Thrown when WDA download fails
 */
export class WdaDownloadError extends WdaError {
  constructor(message: string) {
    super(message)
    this.name = 'WdaDownloadError'
  }
}

/**
 * Thrown when appium-webdriveragent package cannot be resolved from node_modules
 */
export class WdaPackageNotFoundError extends WdaError {
  constructor(message: string) {
    super(message)
    this.name = 'WdaPackageNotFoundError'
  }
}

/**
 * Thrown when WDA build fails
 */
export class WdaBuildError extends WdaError {
  readonly stderr?: string

  constructor(message: string, stderr?: string) {
    super(message)
    this.name = 'WdaBuildError'
    this.stderr = stderr
  }
}
