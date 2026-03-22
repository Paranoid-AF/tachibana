import path from 'node:path'
import { isCompiled, serverDir } from './runtime.ts'

// In compiled binaries, load sharp's native .node addon from disk and inject it
// via globalThis.__sharp_native BEFORE sharp is imported. The patched sharp checks
// this global and skips its own native binding resolution (which fails in bunfs).
if (isCompiled) {
  const platform = `${process.platform}-${process.arch}`
  const bindingPath = path.join(
    serverDir,
    'sharp',
    '@img',
    `sharp-${platform}`,
    'lib',
    `sharp-${platform}.node`
  )
  ;(globalThis as any).__sharp_native = require(bindingPath)
}
