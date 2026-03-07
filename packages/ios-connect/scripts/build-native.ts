#!/usr/bin/env bun
/**
 * Builds the kani-isideload Rust CLI daemon.
 * This single binary replaces zsign and anisette-v3-server.
 *
 * Requires: cargo (Rust toolchain)
 * Cached: skips if binary already exists at expected path.
 * Set SKIP_ISIDELOAD_BUILD=1 to skip entirely.
 */
import { existsSync, mkdirSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { $ } from 'bun'

const PKG_ROOT = dirname(import.meta.dirname!)

function getKaniPlatform(): string {
  const platform = process.platform === 'darwin' ? 'mac' : process.platform
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `${platform}_${arch}`
}

function exeExt(): string {
  return process.platform === 'win32' ? '.exe' : ''
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await $`which ${cmd}`.quiet()
    return true
  } catch {
    return false
  }
}

async function buildIsideload() {
  if (process.env.SKIP_ISIDELOAD_BUILD === '1') {
    console.log('Skipping kani-isideload build (SKIP_ISIDELOAD_BUILD=1)')
    return
  }

  const kaniPlatform = getKaniPlatform()
  const ext = exeExt()
  const binDir = join(PKG_ROOT, 'bin', kaniPlatform)
  const binaryPath = join(binDir, `kani-isideload${ext}`)

  if (existsSync(binaryPath)) {
    console.log(`kani-isideload for ${kaniPlatform} already exists`)
    return
  }

  if (!(await commandExists('cargo'))) {
    console.error('cargo not found. Install Rust: https://rustup.rs/')
    process.exit(1)
  }

  console.log('Building kani-isideload from source...')

  const cliDir = join(PKG_ROOT, 'cli')
  await $`cd ${cliDir} && cargo build --release`

  const builtBinary = join(cliDir, 'target', 'release', `kani-isideload${ext}`)
  if (!existsSync(builtBinary)) {
    console.error('kani-isideload build completed but binary not found')
    process.exit(1)
  }

  mkdirSync(binDir, { recursive: true })
  await $`cp ${builtBinary} ${binaryPath}`
  chmodSync(binaryPath, 0o755)
  console.log(`  kani-isideload binary installed to ${binaryPath}`)
}

buildIsideload().catch(err => {
  console.error('Build script failed:', err)
  process.exit(1)
})
