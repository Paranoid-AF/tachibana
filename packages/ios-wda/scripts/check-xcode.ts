import { $ } from 'bun'
import type { XcodeInfo } from '../src/types.ts'

/**
 * Check if Xcode (full version) is available and meets minimum version requirements.
 * Note: Command Line Tools alone are NOT sufficient - full Xcode is required.
 */
export async function checkXcode(): Promise<XcodeInfo | null> {
  try {
    // Check if xcodebuild exists and can run
    // This will fail if only Command Line Tools are installed or license not accepted
    const result = await $`xcodebuild -version`.text()

    // Check for license issues
    if (result.includes('license') || result.includes('agree')) {
      console.error('\n[ios-wda] ✗ Xcode license not accepted')
      console.error('[ios-wda] 🔧 Run these commands to set up Xcode:\n')
      console.error(
        '[ios-wda]   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer'
      )
      console.error('[ios-wda]   sudo xcodebuild -license')
      console.error('[ios-wda]   sudo xcodebuild -runFirstLaunch')
      console.error(
        '[ios-wda]   sudo xcodebuild -downloadPlatform iOS -buildVersion 18.0\n'
      )
      return null
    }

    // Parse version (e.g., "Xcode 15.2")
    const versionMatch = result.match(/Xcode (\d+\.\d+)/)
    if (!versionMatch) {
      return null
    }

    const version = parseFloat(versionMatch[1])

    // Check minimum version (Xcode 13+ for iOS 15+ support)
    if (version < 13.0) {
      return { available: false, version, tooOld: true }
    }

    return { available: true, version, tooOld: false }
  } catch (error) {
    const errorMsg = (error as Error).message || String(error)

    // Check for license issues in error message
    if (errorMsg.includes('license') || errorMsg.includes('agree')) {
      console.error('\n[ios-wda] ✗ Xcode license not accepted')
      console.error('[ios-wda] 🔧 Run these commands to set up Xcode:\n')
      console.error(
        '[ios-wda]   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer'
      )
      console.error('[ios-wda]   sudo xcodebuild -license')
      console.error('[ios-wda]   sudo xcodebuild -runFirstLaunch')
      console.error(
        '[ios-wda]   sudo xcodebuild -downloadPlatform iOS -buildVersion 18.0\n'
      )
    }

    // xcodebuild failed - could be missing Xcode or only Command Line Tools installed
    return null
  }
}
