import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { WdaPackageNotFoundError } from '../src/errors.ts'

/**
 * Resolve the appium-webdriveragent package source directory from node_modules
 * @returns Absolute path to WDA source directory
 * @throws WdaPackageNotFoundError if package not found
 */
export function resolveWdaPackage(): string {
  // Get package root: scripts/resolve-wda-package.ts → packages/ios-wda/
  const pkgRoot = dirname(import.meta.dirname!)

  // Resolve from node_modules
  const wdaPkgPath = join(pkgRoot, 'node_modules', 'appium-webdriveragent')

  if (!existsSync(wdaPkgPath)) {
    throw new WdaPackageNotFoundError(
      'appium-webdriveragent package not found in node_modules. Run: bun install'
    )
  }

  // Verify package.json exists to confirm it's a valid package
  const packageJsonPath = join(wdaPkgPath, 'package.json')
  if (!existsSync(packageJsonPath)) {
    throw new WdaPackageNotFoundError(
      `Invalid appium-webdriveragent installation: package.json not found at ${packageJsonPath}`
    )
  }

  console.log(`[ios-wda] Resolved appium-webdriveragent at: ${wdaPkgPath}`)
  return wdaPkgPath
}
