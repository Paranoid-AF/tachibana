import path from 'node:path'

// In Bun compiled binaries, source files live in the /$bunfs/ virtual filesystem
export const isCompiled = import.meta.dirname?.startsWith('/$bunfs/') ?? false

export const serverDir = isCompiled
  ? path.dirname(process.execPath)
  : path.resolve(import.meta.dirname!, '..', '..')
