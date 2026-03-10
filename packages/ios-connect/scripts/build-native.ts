#!/usr/bin/env bun
/**
 * Builds the tbana-isideload native addon via napi-rs.
 *
 * Requires: cargo (Rust toolchain) + @napi-rs/cli (installed as devDependency)
 * Cached: skips if the platform .node file exists AND dist/rust-src.hash matches current sources.
 * Set SKIP_NAPI_BUILD=1 to skip entirely.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { $ } from 'bun'
import { hashElement } from 'folder-hash'

const PKG_ROOT = dirname(import.meta.dirname!)
const DIST_DIR = join(PKG_ROOT, 'dist')
const HASH_FILE = join(DIST_DIR, 'rust-src.hash')

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
  return `tbana-isideload.${p}-${a}${ext}`
}

async function computeRustHash(): Promise<string> {
  const srcHash = await hashElement(join(PKG_ROOT, 'src'), {
    encoding: 'hex',
    files: { include: ['*.rs'] },
  })
  const cargoHash = await hashElement(PKG_ROOT, {
    encoding: 'hex',
    files: { include: ['Cargo.toml', 'Cargo.lock', 'build.rs'] },
    folders: { exclude: ['*'] },
  })
  return `${srcHash.hash}:${cargoHash.hash}`
}

async function buildNapiAddon() {
  if (process.env.SKIP_NAPI_BUILD === '1') {
    console.log('Skipping napi addon build (SKIP_NAPI_BUILD=1)')
    return
  }

  const nodeFile = join(DIST_DIR, getNodeFilename())
  const currentHash = await computeRustHash()
  const storedHash = existsSync(HASH_FILE)
    ? readFileSync(HASH_FILE, 'utf8').trim()
    : null

  if (existsSync(nodeFile) && storedHash === currentHash) {
    console.log(`napi addon up to date: ${getNodeFilename()}`)
    return
  }

  if (storedHash !== currentHash) {
    console.log('Rust source changed, rebuilding napi addon...')
  } else {
    console.log('Building tbana-isideload napi addon from source...')
  }

  // Use bunx to run @napi-rs/cli without requiring a global install.
  // --output-dir places .node, index.js, and index.d.ts in dist/.
  // All dist/ files are gitignored and regenerated on postinstall.
  await $`bunx @napi-rs/cli build --platform --release --manifest-path ${join(PKG_ROOT, 'Cargo.toml')} --output-dir ${DIST_DIR}`.cwd(
    PKG_ROOT
  )

  if (!existsSync(nodeFile)) {
    console.error(`napi build completed but ${getNodeFilename()} not found`)
    process.exit(1)
  }

  writeFileSync(HASH_FILE, currentHash)
  console.log(`  napi addon built: ${getNodeFilename()}`)
}

buildNapiAddon().catch(err => {
  console.error('Build script failed:', err)
  process.exit(1)
})
