import { join, dirname } from 'node:path'
import type { WdaResolution } from './types.ts'
import { WdaIpaNotFoundError } from './errors.ts'

/**
 * Resolve WebDriverAgent IPA path.
 * Priority: WDA_IPA_PATH env > compiled mode assets/ > bundled IPA > error
 */
export async function resolveWdaIpa(): Promise<WdaResolution> {
  // 1. Environment variable
  const envPath = Bun.env.WDA_IPA_PATH
  if (envPath) {
    if (!(await Bun.file(envPath).exists())) {
      throw new WdaIpaNotFoundError(
        `WDA_IPA_PATH points to non-existent file: ${envPath}`
      )
    }
    return { path: envPath, source: 'env' }
  }

  // 2. Tbana bundle: resources are in a separate directory passed via env
  const resourceDir = Bun.env.TBANA_RESOURCE_DIR
  if (resourceDir) {
    const bundledPath = join(resourceDir, 'assets', 'WebDriverAgentRunner.ipa')
    if (await Bun.file(bundledPath).exists()) {
      return { path: bundledPath, source: 'bundled' }
    }
  }

  // 3. Look for IPA in assets/ sibling to the executable
  {
    const serverDir = dirname(process.execPath)
    const bundledPath = join(serverDir, 'assets', 'WebDriverAgentRunner.ipa')
    if (await Bun.file(bundledPath).exists()) {
      return { path: bundledPath, source: 'bundled' }
    }
  }

  // 4. Development mode: bundled IPA (relative to this file: src/resolver.ts → ../ipa-build/)
  const pkgRoot = dirname(import.meta.dirname!)
  const devPath = join(pkgRoot, 'ipa-build', 'WebDriverAgentRunner.ipa')

  if (await Bun.file(devPath).exists()) {
    return { path: devPath, source: 'bundled' }
  }

  // 5. No IPA found
  const hint =
    process.platform === 'darwin'
      ? 'Run: cd packages/ios-wda && bun install'
      : 'Copy a pre-built IPA and set WDA_IPA_PATH=/path/to/WebDriverAgentRunner.ipa'
  throw new WdaIpaNotFoundError(`WebDriverAgent IPA not found. ${hint}`)
}

/**
 * Get IPA path (convenience function that just returns the path string)
 */
export async function getWdaIpaPath(): Promise<string> {
  return (await resolveWdaIpa()).path
}
