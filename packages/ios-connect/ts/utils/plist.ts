/**
 * Plist helpers for Apple protocol communication.
 */
import plist from 'plist'

/** Parse a plist buffer/string to a JS object */
export function parsePlist<T = Record<string, unknown>>(
  data: string | Buffer
): T {
  const str = typeof data === 'string' ? data : data.toString('utf-8')
  return plist.parse(str) as T
}

/** Build an XML plist string from a JS object */
export function buildPlist(obj: Record<string, unknown>): string {
  return plist.build(obj as unknown as plist.PlistValue)
}

/** Extract a value from a provisioning profile's embedded plist */
export function extractProfilePlist(
  encodedProfile: string
): Record<string, unknown> {
  const decoded = Buffer.from(encodedProfile, 'base64')
  const str = decoded.toString('utf-8')

  // Provisioning profiles are CMS-signed, the plist is embedded
  // Find the plist portion between <?xml and </plist>
  const start = str.indexOf('<?xml')
  const end = str.indexOf('</plist>')
  if (start === -1 || end === -1) {
    throw new Error('Could not extract plist from provisioning profile')
  }

  return parsePlist(str.substring(start, end + '</plist>'.length))
}
