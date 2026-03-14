import path from 'node:path'

// In Bun compiled binaries, source files live in a virtual filesystem:
//   macOS/Linux: /$bunfs/root/...
//   Windows:     B:/~BUN/root/... (or similar drive letter)
export const isCompiled =
  (import.meta.dirname?.startsWith('/$bunfs/') ||
    /^[A-Z]:\/~BUN\//i.test(import.meta.dirname ?? '')) ??
  false

export const serverDir = isCompiled
  ? path.dirname(process.execPath)
  : path.resolve(import.meta.dirname!, '..', '..')
