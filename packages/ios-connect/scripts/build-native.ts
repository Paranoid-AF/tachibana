#!/usr/bin/env bun
/**
 * Builds the kani-isideload native addon via napi-rs.
 *
 * Requires: cargo (Rust toolchain) + @napi-rs/cli (installed as devDependency)
 * Cached: skips if the platform .node file already exists.
 * Set SKIP_NAPI_BUILD=1 to skip entirely.
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { $ } from 'bun'

const PKG_ROOT = dirname(import.meta.dirname!)
const DIST_DIR = join(PKG_ROOT, 'dist')

function getNodeFilename(): string {
  const platform = process.platform
  const arch = process.arch

  const platformMap: Record<string, string> = {
    darwin: 'darwin',
    linux: 'linux',
    win32: 'win32',
  }
  const archMap: Record<string, string> = {
    arm64: 'arm64',
    x64: 'x64',
  }

  const p = platformMap[platform] ?? platform
  const a = archMap[arch] ?? arch
  const ext = platform === 'win32' ? '.dll' : '.node'
  return `kani-isideload.${p}-${a}${ext}`
}

async function buildNapiAddon() {
  if (process.env.SKIP_NAPI_BUILD === '1') {
    console.log('Skipping napi addon build (SKIP_NAPI_BUILD=1)')
    return
  }

  const nodeFile = join(DIST_DIR, getNodeFilename())
  if (existsSync(nodeFile)) {
    console.log(`napi addon already built: ${getNodeFilename()}`)
    return
  }

  console.log('Building kani-isideload napi addon from source...')

  // Use bunx to run @napi-rs/cli without requiring a global install.
  // --output-dir places .node, index.js, and index.d.ts in dist/.
  // All dist/ files are gitignored and regenerated on postinstall.
  await $`bunx @napi-rs/cli build --platform --release --manifest-path ${join(PKG_ROOT, 'Cargo.toml')} --output-dir ${DIST_DIR}`.cwd(PKG_ROOT)

  if (!existsSync(nodeFile)) {
    console.error(`napi build completed but ${getNodeFilename()} not found`)
    process.exit(1)
  }

  console.log(`  napi addon built: ${getNodeFilename()}`)
}

buildNapiAddon().catch(err => {
  console.error('Build script failed:', err)
  process.exit(1)
})
