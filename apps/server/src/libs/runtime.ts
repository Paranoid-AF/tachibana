import path from 'node:path'

export const isCompiled =
  process.argv[0] === process.execPath &&
  !process.execPath.includes('node_modules')

export const serverDir = isCompiled
  ? path.dirname(process.execPath)
  : path.resolve(import.meta.dirname!, '..', '..')
