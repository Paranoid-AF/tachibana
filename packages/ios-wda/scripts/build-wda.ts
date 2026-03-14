import { $ } from 'bun'
import { join } from 'node:path'
import { stat } from 'node:fs/promises'
import { WdaBuildError } from '../src/errors.ts'

/**
 * Build WebDriverAgent IPA using xcodebuild
 * @param wdaSourceDir Path to extracted WDA source directory
 * @returns Path to the built IPA file
 */
export async function buildWebDriverAgent(
  wdaSourceDir: string
): Promise<string> {
  const buildDir = join(wdaSourceDir, 'build')
  const archivePath = join(buildDir, 'WebDriverAgentRunner.xcarchive')
  const ipaPath = join(buildDir, 'WebDriverAgentRunner.ipa')

  console.log('[ios-wda] Building WebDriverAgent...')

  try {
    // Step 1: Clean build directory
    console.log('[ios-wda] Cleaning build directory...')
    const cleanResult =
      await $`xcodebuild clean -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner -configuration Release`
        .cwd(wdaSourceDir)
        .nothrow()

    if (cleanResult.exitCode !== 0) {
      const stderr = cleanResult.stderr?.toString() || 'Unknown error'
      console.error('[ios-wda] Clean failed:', stderr)
      throw new WdaBuildError('Clean build failed', stderr)
    }

    // Step 2: Build archive (unsigned)
    console.log('[ios-wda] Building archive (this may take a few minutes)...')
    // Force iOS device build, disable Mac Catalyst
    const archiveResult =
      await $`xcodebuild archive -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner -configuration Release -archivePath ${archivePath} -sdk iphoneos -allowProvisioningUpdates SUPPORTS_MACCATALYST=NO CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO DEVELOPMENT_TEAM="" ONLY_ACTIVE_ARCH=NO`
        .cwd(wdaSourceDir)
        .nothrow()

    if (archiveResult.exitCode !== 0) {
      const stderr = archiveResult.stderr?.toString() || 'Unknown error'
      throw new WdaBuildError('Archive build failed', stderr)
    }

    // Verify archive exists (.xcarchive is a directory bundle)
    try {
      await stat(archivePath)
    } catch {
      throw new WdaBuildError('Archive build failed: .xcarchive not found')
    }

    // Step 3: Create IPA manually from build products
    console.log('[ios-wda] Creating IPA from build products...')

    // Find the .app in DerivedData (it's in UninstalledProducts because it's unsigned)
    const findAppResult =
      await $`find ~/Library/Developer/Xcode/DerivedData -path "*/ArchiveIntermediates/WebDriverAgentRunner/*/UninstalledProducts/iphoneos/*.app" -type d | head -1`.text()

    const appPath = findAppResult.trim()
    if (!appPath || !(await Bun.file(appPath).exists())) {
      throw new WdaBuildError(
        'Build product not found: .app not found in DerivedData'
      )
    }

    console.log(`[ios-wda] Found .app at: ${appPath}`)

    // Create Payload directory
    const payloadDir = join(buildDir, 'Payload')
    await $`mkdir -p ${payloadDir}`.cwd(wdaSourceDir).quiet()

    // Copy .app to Payload
    await $`cp -r ${appPath} ${payloadDir}/`.cwd(wdaSourceDir).quiet()

    // Create IPA (zip the Payload directory)
    await $`cd ${buildDir} && zip -qr WebDriverAgentRunner.ipa Payload`.cwd(
      wdaSourceDir
    )

    // Verify IPA exists
    if (!(await Bun.file(ipaPath).exists())) {
      throw new WdaBuildError('IPA creation failed: .ipa file not found')
    }

    console.log('[ios-wda] IPA created successfully')

    console.log('[ios-wda] Build successful!')
    return ipaPath
  } catch (error) {
    if (error instanceof WdaBuildError) {
      throw error
    }

    throw new WdaBuildError(`Build failed: ${(error as Error).message}`)
  }
}
