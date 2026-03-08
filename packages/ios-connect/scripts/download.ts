#!/usr/bin/env bun
/**
 * Downloads native binaries required by @tbana/ios-connect:
 * - Sideloader CLI from GitHub Actions artifacts (Dadoum/Sideloader)
 *
 * Uses `gh` CLI for downloads.
 *
 * Skip with SKIP_SIDELOADER_DOWNLOAD=1.
 * Set DOWNLOAD_ALL_PLATFORMS=1 to download for all platforms (used in CI).
 * Cached: skips if binary already exists at expected path.
 */
import { existsSync, mkdirSync, chmodSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { $ } from 'bun'

// ── Sideloader ──────────────────────────────────────────────

const SIDELOADER_REPO = 'Dadoum/Sideloader'
const SIDELOADER_RUN_ID = 21932643526

/** Map Tbana platform convention to Sideloader artifact names */
const SIDELOADER_ARTIFACT_MAP: Record<string, string> = {
  mac_arm64: 'sideloader-cli-arm64-apple-macos',
  mac_x64: 'sideloader-cli-x86_64-apple-darwin',
  linux_x64: 'sideloader-cli-x86_64-linux-gnu',
  linux_arm64: 'sideloader-cli-aarch64-linux-gnu',
  win_x64: 'sideloader-cli-x86_64-windows-msvc',
}

/** Map Tbana platform to the actual binary filename inside the Sideloader artifact */
const SIDELOADER_BINARY_NAME: Record<string, string> = {
  mac_arm64: 'sideloader-cli-arm64-apple-macos',
  mac_x64: 'sideloader-cli-x86_64-apple-darwin',
  linux_x64: 'sideloader-cli-x86_64-linux-gnu',
  linux_arm64: 'sideloader-cli-aarch64-linux-gnu',
  win_x64: 'sideloader-cli-x86_64-windows-msvc.exe',
}

// ── Shared ──────────────────────────────────────────────────

const PKG_ROOT = dirname(import.meta.dirname!)

function getTbanaPlatform(): string {
  const platform = process.platform === 'darwin' ? 'mac' : process.platform
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `${platform}_${arch}`
}

/** Returns '.exe' for Windows platforms, '' otherwise */
function exeExt(tbanaPlatform: string): string {
  return tbanaPlatform.startsWith('win') ? '.exe' : ''
}

function getTargetPlatforms(platformMap: Record<string, string>): string[] {
  if (process.env.DOWNLOAD_ALL_PLATFORMS === '1') {
    return Object.keys(platformMap)
  }
  return [getTbanaPlatform()]
}

// ── Sideloader download ─────────────────────────────────────

async function downloadSideloaderForPlatform(tbanaPlatform: string) {
  const artifactName = SIDELOADER_ARTIFACT_MAP[tbanaPlatform]
  if (!artifactName) {
    console.log(
      `No Sideloader artifact for platform: ${tbanaPlatform}, skipping`
    )
    return
  }

  const ext = exeExt(tbanaPlatform)
  const binDir = join(PKG_ROOT, 'bin', tbanaPlatform)
  const binaryPath = join(binDir, `sideloader${ext}`)

  if (existsSync(binaryPath)) {
    console.log(`Sideloader for ${tbanaPlatform} already exists`)
    return
  }

  console.log(`Downloading Sideloader for ${tbanaPlatform}...`)

  const tmpDir = join(PKG_ROOT, `.tmp-download-sideloader-${tbanaPlatform}`)
  mkdirSync(tmpDir, { recursive: true })

  try {
    await $`gh run download ${SIDELOADER_RUN_ID} -R ${SIDELOADER_REPO} -n ${artifactName} -D ${tmpDir}`

    const binaryName = SIDELOADER_BINARY_NAME[tbanaPlatform]!
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
}

main().catch(err => {
  console.error('Download script failed:', err)
  process.exit(1)
})
