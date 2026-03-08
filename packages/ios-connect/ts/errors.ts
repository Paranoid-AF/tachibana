export class ConnectError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConnectError'
  }
}

export class SideloaderError extends ConnectError {
  readonly exitCode: number | null

  constructor(message: string, exitCode: number | null = null) {
    super(message)
    this.name = 'SideloaderError'
    this.exitCode = exitCode
  }
}

export class AuthenticationError extends ConnectError {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export class TwoFactorRequiredError extends ConnectError {
  constructor() {
    super('Two-factor authentication required')
    this.name = 'TwoFactorRequiredError'
  }
}

export class BinaryNotFoundError extends ConnectError {
  readonly binaryName: string

  constructor(binaryName: string) {
    super(
      `${binaryName} binary not found. Place it in bin/ or set the corresponding env var.`
    )
    this.name = 'BinaryNotFoundError'
    this.binaryName = binaryName
  }
}

export class RenewalError extends ConnectError {
  readonly bundleId: string

  constructor(message: string, bundleId: string) {
    super(message)
    this.name = 'RenewalError'
    this.bundleId = bundleId
  }
}
