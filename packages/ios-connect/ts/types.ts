// ── Credentials & Auth Types ──

export interface AppleCredentials {
  appleAccount: string
  password: string
}

export interface AccountInfo {
  firstName: string
  lastName: string
  appleAccount: string
}

/** 2FA method info */
export interface TwoFactorInfo {
  type: 'trustedDevice' | 'sms'
  phoneNumbers?: PhoneNumberInfo[]
}

export interface PhoneNumberInfo {
  id: number
  numberWithDialCode: string
}

/** Callback for 2FA code input */
export type TwoFactorCallback = (info: TwoFactorInfo) => Promise<string>

// ── Sideloader Types ──

export interface SideloaderOptions {
  credentials?: AppleCredentials
  on2FA?: (info: TwoFactorInfo) => Promise<string>
  udid?: string
  binaryPath?: string
  teamId?: string
}

export type SideloaderResult<T> =
  | { success: true; data: T }
  | { success: false; error: SideloaderErrorData }

export interface SideloaderErrorData {
  code: string
  message: string
  exitCode?: number
}

export type {
  Team as DeveloperTeam,
  Cert as DevelopmentCert,
  AppId as AppIdInfo,
} from '../dist/index'

export interface InstallProgress {
  stage: string
  message: string
}

export type InstallProgressCallback = (progress: InstallProgress) => void

// ── Renewal Types ──

export interface SigningRecord {
  appBundleId: string
  ipaPath: string
  deviceUdid: string
  certSerialNumber: string
  certExpiresAt: string
  profileUuid: string
  signedAt: string
  lastRenewedAt: string
}

export interface SigningState {
  records: SigningRecord[]
  lastChecked?: string
}

export interface RenewalEvent {
  type: 'renewal:start' | 'renewal:success' | 'renewal:error' | 'renewal:skip'
  record?: SigningRecord
  error?: Error
}

export type RenewalEventCallback = (event: RenewalEvent) => void

export interface SchedulerOptions {
  credentials: AppleCredentials
  on2FA: TwoFactorCallback
  intervalHours?: number
  thresholdDays?: number
  onEvent?: RenewalEventCallback
}

// ── Binary Resolution Types ──

export type Platform = 'darwin' | 'linux'
export type Arch = 'arm64' | 'x64'
