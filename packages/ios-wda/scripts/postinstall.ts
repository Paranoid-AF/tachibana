import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { checkXcode } from './check-xcode.ts'
import { resolveWdaPackage } from './resolve-wda-package.ts'
import { buildWebDriverAgent } from './build-wda.ts'
import type { WdaVersionInfo } from '../src/types.ts'

const PACKAGE_ROOT = join(import.meta.dir, '..')
const BUILD_DIR = join(PACKAGE_ROOT, 'ipa-build')
const IPA_PATH = join(BUILD_DIR, 'WebDriverAgentRunner.ipa')
const VERSION_FILE = join(BUILD_DIR, 'wda-version.json')

/**
 * Check if build should be skipped
 */
async function shouldSkipBuild(): Promise<boolean> {
  // Check SKIP_WDA_BUILD environment variable
  if (Bun.env.SKIP_WDA_BUILD === '1') {
    console.log('[ios-wda] SKIP_WDA_BUILD=1, skipping build')
    return true
  }

  // WDA IPA can only be built on macOS (requires Xcode + xcodebuild)
  if (process.platform !== 'darwin') {
    console.log(
      '[ios-wda] Not on macOS, skipping WDA IPA build (requires Xcode)'
    )
    console.log(
      '[ios-wda] To use WDA on this platform, set WDA_IPA_PATH to a pre-built IPA'
    )
    return true
  }

  // Check if IPA already exists
  if (await Bun.file(IPA_PATH).exists()) {
    console.log('[ios-wda] WebDriverAgent IPA already exists, skipping build')
    return true
  }

  return false
}

/**
 * Main postinstall function
 */
async function main() {
  console.log('[ios-wda] Running postinstall...')

  // Check if build should be skipped
  if (await shouldSkipBuild()) {
    process.exit(0)
  }

  // Check Xcode availability
  const xcodeInfo = await checkXcode()

  if (!xcodeInfo) {
    console.error(
      '[ios-wda] ⚠️  Xcode (full version) not found or not properly set up'
    )
    console.error('[ios-wda] Note: Command Line Tools alone are NOT sufficient')
    console.error('[ios-wda]')
    console.error(
      '[ios-wda] If you have Xcode installed, run these setup commands:'
    )
    console.error(
      '[ios-wda]   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer'
    )
    console.error('[ios-wda]   sudo xcodebuild -license')
    console.error('[ios-wda]   sudo xcodebuild -runFirstLaunch')
    console.error(
      '[ios-wda]   sudo xcodebuild -downloadPlatform iOS -buildVersion 18.0'
    )
    console.error('[ios-wda]')
    console.error(
      '[ios-wda] Or install Xcode from: https://apps.apple.com/app/xcode/id497799835'
    )
    console.error('[ios-wda]')
    console.error('[ios-wda] Alternatively:')
    console.error('[ios-wda]   • Skip the build: SKIP_WDA_BUILD=1 bun install')
    console.error(
      '[ios-wda]   • Use custom IPA: export WDA_IPA_PATH=/path/to/WebDriverAgentRunner.ipa'
    )
    console.error('[ios-wda]')
    process.exit(1)
  }

  if (xcodeInfo.tooOld) {
    console.warn(
      `[ios-wda] ⚠️  Xcode ${xcodeInfo.version} is too old (13.0+ required)`
    )
    console.warn('[ios-wda] Update Xcode from the Mac App Store')
    console.warn('[ios-wda] Skipping WDA build...')
    process.exit(0)
  }

  console.log(`[ios-wda] ✓ Xcode ${xcodeInfo.version} detected`)

  let wdaSourceDir: string

  try {
    // Create build directory
    await mkdir(BUILD_DIR, { recursive: true })

    // Resolve WDA package from node_modules
    wdaSourceDir = await resolveWdaPackage()

    // Build unsigned IPA
    const builtIpaPath = await buildWebDriverAgent(wdaSourceDir)

    // Copy IPA to build directory
    console.log('[ios-wda] Copying IPA to build directory...')
    await Bun.write(IPA_PATH, Bun.file(builtIpaPath))

    // Write version metadata
    const packageJson = JSON.parse(
      await Bun.file(join(wdaSourceDir, 'package.json')).text()
    )
    const versionInfo: WdaVersionInfo = {
      wdaVersion: packageJson.version,
      builtAt: new Date().toISOString(),
      xcodeVersion: xcodeInfo.version?.toString(),
    }
    await Bun.write(VERSION_FILE, JSON.stringify(versionInfo, null, 2))

    console.log('[ios-wda] ✓ WebDriverAgent IPA built successfully!')
    console.log(`[ios-wda] Location: ${IPA_PATH}`)
  } catch (error) {
    // Handle package not found error
    if ((error as any).name === 'WdaPackageNotFoundError') {
      console.error(
        '\n[ios-wda] ✗ Package not found:',
        (error as Error).message
      )
      console.error('[ios-wda]')
      console.error('[ios-wda] This usually means:')
      console.error('[ios-wda]   1. Dependencies were not installed properly')
      console.error('[ios-wda]   2. Run: bun install')
      console.error('[ios-wda]')
      process.exit(1)
    }

    console.error('\n[ios-wda] ✗ Build failed:', (error as Error).message)

    // Print stderr if available (from WdaBuildError)
    if ((error as any).stderr) {
      const stderr = (error as any).stderr
      console.error('[ios-wda] Build error details:', stderr)

      // Check for common Xcode setup issues
      if (stderr.includes('license') || stderr.includes('agree')) {
        console.error('\n[ios-wda] 🔧 Xcode Setup Required:')
        console.error(
          '[ios-wda] Run these commands to set up Xcode properly:\n'
        )
        console.error(
          '[ios-wda]   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer'
        )
        console.error('[ios-wda]   sudo xcodebuild -license')
        console.error('[ios-wda]   sudo xcodebuild -runFirstLaunch')
        console.error(
          '[ios-wda]   sudo xcodebuild -downloadPlatform iOS -buildVersion 18.0\n'
        )
      }

      // Check for missing iOS SDK
      if (stderr.includes('is not installed') && stderr.includes('iOS')) {
        console.error('\n[ios-wda] 🔧 iOS SDK Missing:')
        console.error('[ios-wda] Download the iOS platform:\n')
        console.error(
          '[ios-wda]   sudo xcodebuild -downloadPlatform iOS -buildVersion 18.0'
        )
        console.error('[ios-wda]')
        console.error('[ios-wda] Or install via Xcode GUI:')
        console.error(
          '[ios-wda]   Xcode > Settings > Platforms > Download iOS\n'
        )
      }
    }

    console.error('[ios-wda] Alternatively:')
    console.error('[ios-wda]   • Skip the build: SKIP_WDA_BUILD=1 bun install')
    console.error(
      '[ios-wda]   • Use custom IPA: export WDA_IPA_PATH=/path/to/WebDriverAgentRunner.ipa\n'
    )

    // Exit with error code to fail the install
    process.exit(1)
  }
}

// Run main function
main()
