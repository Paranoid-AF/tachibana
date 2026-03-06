#!/usr/bin/env bun
/**
 * Downloads native binaries required by @kaniapp/ios-connect:
 * - Sideloader CLI from GitHub Actions artifacts (Dadoum/Sideloader)
 * - go-ios CLI from GitHub releases (danielpaulus/go-ios)
 *
 * Uses `gh` CLI for both downloads.
 *
 * Skip individually with SKIP_SIDELOADER_DOWNLOAD=1 or SKIP_GO_IOS_DOWNLOAD=1.
 * Set DOWNLOAD_ALL_PLATFORMS=1 to download for all platforms (used in CI).
 * Cached: skips if binary already exists at expected path.
 */
import { existsSync, mkdirSync, chmodSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { $ } from 'bun'

// ── Sideloader ──────────────────────────────────────────────

const SIDELOADER_REPO = 'Dadoum/Sideloader'
const SIDELOADER_RUN_ID = 21932643526

/** Map Kani platform convention to Sideloader artifact names */
const SIDELOADER_ARTIFACT_MAP: Record<string, string> = {
  mac_arm64: 'sideloader-cli-arm64-apple-macos',
  mac_x64: 'sideloader-cli-x86_64-apple-darwin',
  linux_x64: 'sideloader-cli-x86_64-linux-gnu',
  linux_arm64: 'sideloader-cli-aarch64-linux-gnu',
  win_x64: 'sideloader-cli-x86_64-windows-msvc',
}

/** Map Kani platform to the actual binary filename inside the Sideloader artifact */
const SIDELOADER_BINARY_NAME: Record<string, string> = {
  mac_arm64: 'sideloader-cli-arm64-apple-macos',
  mac_x64: 'sideloader-cli-x86_64-apple-darwin',
  linux_x64: 'sideloader-cli-x86_64-linux-gnu',
  linux_arm64: 'sideloader-cli-aarch64-linux-gnu',
  win_x64: 'sideloader-cli-x86_64-windows-msvc.exe',
}

// ── go-ios ──────────────────────────────────────────────────

const GO_IOS_REPO = 'danielpaulus/go-ios'
const GO_IOS_VERSION = 'v1.0.202'

/** Map Kani platform convention to go-ios release asset names */
const GO_IOS_ASSET_MAP: Record<string, string> = {
  mac_arm64: 'go-ios-mac.zip',
  mac_x64: 'go-ios-mac.zip',
  linux_x64: 'go-ios-linux.zip',
  linux_arm64: 'go-ios-linux.zip',
  win_x64: 'go-ios-win.zip',
}

/** Map Kani platform to the binary name inside the go-ios zip */
const GO_IOS_BINARY_NAME: Record<string, string> = {
  mac_arm64: 'ios',
  mac_x64: 'ios',
  linux_x64: 'ios-amd64',
  linux_arm64: 'ios-arm64',
  win_x64: 'ios.exe',
}

// ── Shared ──────────────────────────────────────────────────

const PKG_ROOT = dirname(import.meta.dirname!)

function getKaniPlatform(): string {
  const platform = process.platform === 'darwin' ? 'mac' : process.platform
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `${platform}_${arch}`
}

/** Returns '.exe' for Windows platforms, '' otherwise */
function exeExt(kaniPlatform: string): string {
  return kaniPlatform.startsWith('win') ? '.exe' : ''
}

function getTargetPlatforms(platformMap: Record<string, string>): string[] {
  if (process.env.DOWNLOAD_ALL_PLATFORMS === '1') {
    return Object.keys(platformMap)
  }
  return [getKaniPlatform()]
}

// ── Sideloader download ─────────────────────────────────────

async function downloadSideloaderForPlatform(kaniPlatform: string) {
  const artifactName = SIDELOADER_ARTIFACT_MAP[kaniPlatform]
  if (!artifactName) {
    console.log(
      `No Sideloader artifact for platform: ${kaniPlatform}, skipping`
    )
    return
  }

  const ext = exeExt(kaniPlatform)
  const binDir = join(PKG_ROOT, 'bin', kaniPlatform)
  const binaryPath = join(binDir, `sideloader${ext}`)

  if (existsSync(binaryPath)) {
    console.log(`Sideloader for ${kaniPlatform} already exists`)
    return
  }

  console.log(`Downloading Sideloader for ${kaniPlatform}...`)

  const tmpDir = join(PKG_ROOT, `.tmp-download-sideloader-${kaniPlatform}`)
  mkdirSync(tmpDir, { recursive: true })

  try {
    await $`gh run download ${SIDELOADER_RUN_ID} -R ${SIDELOADER_REPO} -n ${artifactName} -D ${tmpDir}`

    const binaryName = SIDELOADER_BINARY_NAME[kaniPlatform]!
    const sourcePath = join(tmpDir, binaryName)

    if (!existsSync(sourcePath)) {
      const files = readdirSync(tmpDir)
      console.error(
        `  Expected binary '${binaryName}', found: ${files.join(', ')}`
      )
      return
    }

    mkdirSync(binDir, { recursive: true })
    await $`mv ${sourcePath} ${binaryPath}`
    chmodSync(binaryPath, 0o755)
    console.log(`  Sideloader binary installed to ${binaryPath}`)
  } finally {
    await $`rm -rf ${tmpDir}`.quiet().nothrow()
  }
}

async function downloadSideloader() {
  if (process.env.SKIP_SIDELOADER_DOWNLOAD === '1') {
    console.log('Skipping Sideloader download (SKIP_SIDELOADER_DOWNLOAD=1)')
    return
  }

  const platforms = getTargetPlatforms(SIDELOADER_ARTIFACT_MAP)
  for (const p of platforms) {
    try {
      await downloadSideloaderForPlatform(p)
    } catch (err) {
      console.error(`Failed to download Sideloader for ${p}:`, err)
      throw err
    }
  }
}

// ── go-ios download ─────────────────────────────────────────

async function downloadGoIosForPlatform(kaniPlatform: string) {
  const assetName = GO_IOS_ASSET_MAP[kaniPlatform]
  if (!assetName) {
    console.log(`No go-ios asset for platform: ${kaniPlatform}, skipping`)
    return
  }

  const ext = exeExt(kaniPlatform)
  const binDir = join(PKG_ROOT, 'bin', kaniPlatform)
  const binaryPath = join(binDir, `ios${ext}`)

  if (existsSync(binaryPath)) {
    console.log(`go-ios for ${kaniPlatform} already exists`)
    return
  }

  console.log(`Downloading go-ios for ${kaniPlatform}...`)

  const tmpDir = join(PKG_ROOT, `.tmp-download-goios-${kaniPlatform}`)
  mkdirSync(tmpDir, { recursive: true })

  try {
    await $`gh release download ${GO_IOS_VERSION} --repo ${GO_IOS_REPO} --pattern ${assetName} -D ${tmpDir}`
    await $`unzip -o ${join(tmpDir, assetName)} -d ${tmpDir}`

    const binaryName = GO_IOS_BINARY_NAME[kaniPlatform]!
    const sourcePath = join(tmpDir, binaryName)

    if (!existsSync(sourcePath)) {
      const files = readdirSync(tmpDir).filter(f => !f.endsWith('.zip'))
      console.error(
        `  Expected binary '${binaryName}', found: ${files.join(', ')}`
      )
      return
    }

    mkdirSync(binDir, { recursive: true })
    await $`cp ${sourcePath} ${binaryPath}`
    chmodSync(binaryPath, 0o755)
    console.log(`  go-ios binary installed to ${binaryPath}`)
  } finally {
    await $`rm -rf ${tmpDir}`.quiet().nothrow()
  }
}

async function downloadGoIos() {
  if (process.env.SKIP_GO_IOS_DOWNLOAD === '1') {
    console.log('Skipping go-ios download (SKIP_GO_IOS_DOWNLOAD=1)')
    return
  }

  const platforms = getTargetPlatforms(GO_IOS_ASSET_MAP)
  for (const p of platforms) {
    try {
      await downloadGoIosForPlatform(p)
    } catch (err) {
      console.error(`Failed to download go-ios for ${p}:`, err)
      throw err
    }
  }
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  // Check if gh CLI is available (needed for both downloads)
  try {
    await $`gh --version`.quiet()
  } catch {
    console.error('gh CLI not found. Install with: brew install gh')
    console.error('Skipping binary downloads.')
    return
  }

  await downloadSideloader()
  await downloadGoIos()
}

main().catch(err => {
  console.error('Download script failed:', err)
  process.exit(1)
})
