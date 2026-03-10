// Types
export type { WdaResolution, XcodeInfo, WdaVersionInfo } from './types.ts'

// Errors
export {
  WdaError,
  WdaIpaNotFoundError,
  WdaDownloadError,
  WdaBuildError,
} from './errors.ts'

// Functions
export { resolveWdaIpa, getWdaIpaPath } from './resolver.ts'

// Re-export as namespace for consistency
export * as wda from './resolver.ts'
