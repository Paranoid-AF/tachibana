// Isideload daemon commands (replaces apple-api + sideloader)
export * as sideloader from './isideload/commands/install.ts'
export * as cert from './isideload/commands/cert.ts'
export * as team from './isideload/commands/team.ts'
export * as sideloaderDevice from './isideload/commands/device.ts'
export * as appId from './isideload/commands/app-id.ts'
export * as screenshot from './isideload/commands/screenshot.ts'
export * as photos from './isideload/commands/photos.ts'
export * as tunnel from './isideload/commands/tunnel.ts'
export * as device from './isideload/commands/device.ts'

// Daemon lifecycle (replaces anisette provider lifecycle)
export {
  getDaemon,
  stopDaemon,
  configureDaemon,
  onDaemonEvent,
} from './isideload/daemon.ts'

// WDA client
export * as wdaClient from './wda/index.ts'

// Renewal
export * as renewal from './renewal/index.ts'

// Utils
export * as ipa from './utils/ipa.ts'
export { generateBundleId } from './utils/bundleId.ts'
export { parsePlist, buildPlist, extractProfilePlist } from './utils/plist.ts'

// Types
export type {
  AppleCredentials,
  AccountInfo,
  TwoFactorInfo,
  PhoneNumberInfo,
  TwoFactorCallback,
  SideloaderOptions,
  SideloaderResult,
  SideloaderErrorData,
  DeveloperTeam,
  DevelopmentCert,
  AppIdInfo,
  InstallProgress,
  InstallProgressCallback,
  SigningRecord,
  SigningState,
  RenewalEvent,
  RenewalEventCallback,
  SchedulerOptions,
  Platform,
  Arch,
} from './types.ts'

// Isideload device types
export type { ConnectedDevice } from './isideload/commands/device.ts'
export type { TunnelResult } from './isideload/commands/tunnel.ts'
export type { PhotoEntry } from './isideload/commands/photos.ts'

// WDA types
export type {
  SessionCapabilities,
  DeviceCapabilities,
  WdaStatus,
  WebDriverError,
  ElementStrategy,
} from './wda/types.ts'

// Errors
export {
  ConnectError,
  SideloaderError,
  AuthenticationError,
  TwoFactorRequiredError,
  BinaryNotFoundError,
  RenewalError,
} from './errors.ts'
