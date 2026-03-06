import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { WdaResolution } from './types.ts'
import { WdaIpaNotFoundError } from './errors.ts'

/**
 * Resolve WebDriverAgent IPA path.
 * Priority: WDA_IPA_PATH env > compiled mode assets/ > bundled IPA > error
 */
export function resolveWdaIpa(): WdaResolution {
  // 1. Environment variable
  const envPath = process.env.WDA_IPA_PATH
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new WdaIpaNotFoundError(
        `WDA_IPA_PATH points to non-existent file: ${envPath}`
      )
    }
    return { path: envPath, source: 'env' }
  }

  // 2. Tauri bundle: resources are in a separate directory passed via env
  const resourceDir = process.env.KANI_RESOURCE_DIR
  if (resourceDir) {
    const bundledPath = join(resourceDir, 'assets', 'WebDriverAgentRunner.ipa')
    if (existsSync(bundledPath)) {
      return { path: bundledPath, source: 'bundled' }
    }
  }

  // 3. Detect if running from a compiled binary
  // In compiled mode, process.argv[0] === process.execPath and it's not in node_modules
  const isCompiled =
    process.argv[0] === process.execPath &&
    !process.execPath.includes('node_modules')

  if (isCompiled) {
    // Look for IPA in assets/ sibling to the compiled server
    const serverDir = dirname(process.execPath)
    const bundledPath = join(serverDir, 'assets', 'WebDriverAgentRunner.ipa')
    if (existsSync(bundledPath)) {
      return { path: bundledPath, source: 'bundled' }
    }
  }

  // 4. Development mode: bundled IPA (relative to this file: src/resolver.ts → ../ipa-build/)
  const pkgRoot = dirname(import.meta.dirname!)
  const devPath = join(pkgRoot, 'ipa-build', 'WebDriverAgentRunner.ipa')

  if (existsSync(devPath)) {
    return { path: devPath, source: 'bundled' }
  }

  // 5. No IPA found
  throw new WdaIpaNotFoundError(
    'WebDriverAgent IPA not found. Run: cd packages/ios-wda && bun install'
  )
}

/**
 * Get IPA path (convenience function that just returns the path string)
 */
export function getWdaIpaPath(): string {
  return resolveWdaIpa().path
}
