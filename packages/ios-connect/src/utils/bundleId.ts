import { randomBytes } from 'node:crypto'

const ALPHA = 'abcdefghijklmnopqrstuvwxyz'
const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyz0123456789'

function randomChars(charset: string, length: number): string {
  const bytes = randomBytes(length)
  let result = ''
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i]! % charset.length]
  }
  return result
}

/**
 * Generate a realistic-looking bundle ID.
 * Format: com.AAAA.BBB.CCCCCC
 *  - AAAA: 4 random lowercase letters
 *  - BBB:  3 random lowercase letters
 *  - CCCCCC: 6 random lowercase alphanumeric chars
 */
export function generateBundleId(): string {
  const a = randomChars(ALPHA, 4)
  const b = randomChars(ALPHA, 3)
  const c = randomChars(ALPHANUMERIC, 6)
  return `com.${a}.${b}.${c}`
}
