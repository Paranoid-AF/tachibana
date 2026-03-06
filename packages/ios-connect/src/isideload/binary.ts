import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'

const EXE_EXT = process.platform === 'win32' ? '.exe' : ''
const BINARY_NAME = `kani-isideload${EXE_EXT}`

function getKaniPlatform(): string {
  const platform = process.platform === 'darwin' ? 'mac' : process.platform
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  return `${platform}_${arch}`
}

/**
 * Resolve the kani-isideload binary path.
 * Priority:
 * 1. Explicit override
 * 2. ISIDELOAD_BINARY env var
 * 3. KANI_RESOURCE_DIR/bin/ (Tauri bundle)
 * 4. Compiled mode: sibling bin/ directory
 * 5. Dev mode: packages/ios-connect/bin/{platform}/
 */
export function resolveBinary(overridePath?: string): string {
  if (overridePath) return overridePath

  const envPath = process.env.ISIDELOAD_BINARY
  if (envPath) return envPath

  // Tauri bundle: resources dir passed via env
  const resourceDir = process.env.KANI_RESOURCE_DIR
  if (resourceDir) {
    const binPath = join(resourceDir, 'bin', BINARY_NAME)
    if (existsSync(binPath)) return binPath
  }

  // Compiled binary (bun build --compile)
  const isCompiled = import.meta.url.includes('$bunfs')
  if (isCompiled) {
    const serverDir = dirname(process.execPath)
    const binPath = join(serverDir, 'bin', BINARY_NAME)
    if (existsSync(binPath)) return binPath
  }

  // Dev mode: cargo build output at cli/target/release/
  const pkgRoot = dirname(dirname(import.meta.dirname!))
  const cargoRelease = join(pkgRoot, 'cli', 'target', 'release', BINARY_NAME)
  if (existsSync(cargoRelease)) return cargoRelease

  // Dev mode: pre-built binaries at bin/{platform}/
  const kaniPlatform = getKaniPlatform()
  const bundledPath = join(pkgRoot, 'bin', kaniPlatform, BINARY_NAME)
  if (existsSync(bundledPath)) return bundledPath

  // Fallback: assume on PATH
  return BINARY_NAME
}
