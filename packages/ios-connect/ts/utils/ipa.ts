/**
 * IPA utilities: metadata extraction and bundle ID rewriting.
 * Uses JSZip for ZIP handling.
 */
import JSZip from 'jszip'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bplistParser from 'bplist-parser'
import { parsePlist, buildPlist } from './plist.ts'

const BPLIST_MAGIC = Buffer.from('bplist00')

function parsePlistBytes(data: Uint8Array): Record<string, unknown> {
  const buf = Buffer.from(data)
  if (buf.subarray(0, 8).equals(BPLIST_MAGIC)) {
    return bplistParser.parseBuffer<Record<string, unknown>>(buf)[0]
  }
  return parsePlist<Record<string, unknown>>(buf.toString('utf-8'))
}

/** Minimal IPA metadata extracted from Info.plist */
export interface IpaMetadata {
  bundleId: string
  bundleName: string
  bundleVersion: string
  executableName: string
}

/**
 * Extract metadata from an IPA file by reading Info.plist from the zip.
 */
export async function extractIpaMetadata(
  ipaPath: string
): Promise<IpaMetadata> {
  // IPAs are zip files with structure: Payload/<AppName>.app/Info.plist
  const ipaData = await Bun.file(ipaPath).bytes()
  const plistContent = await findInfoPlist(ipaData)
  if (!plistContent) {
    throw new Error(`No Info.plist found in IPA: ${ipaPath}`)
  }

  const plistData = parsePlist<Record<string, string>>(plistContent)

  return {
    bundleId: plistData.CFBundleIdentifier ?? '',
    bundleName: plistData.CFBundleName ?? plistData.CFBundleDisplayName ?? '',
    bundleVersion: plistData.CFBundleShortVersionString ?? '',
    executableName: plistData.CFBundleExecutable ?? '',
  }
}

/**
 * Find and extract Info.plist from IPA zip data.
 */
async function findInfoPlist(zipData: Uint8Array): Promise<string | null> {
  const zip = await JSZip.loadAsync(zipData)
  for (const [name, file] of Object.entries(zip.files)) {
    if (/^Payload\/[^/]+\.app\/Info\.plist$/.test(name) && !file.dir) {
      return await file.async('string')
    }
  }
  return null
}

// ── ZIP rewriting ──────────────────────────────────────────────────────────

const MAIN_INFO_PLIST_RE = /^Payload\/[^/]+\.app\/Info\.plist$/
const PLUGIN_INFO_PLIST_RE =
  /^Payload\/[^/]+\.app\/PlugIns\/([^/]+)\.xctest\/Info\.plist$/

/**
 * XCTest framework entries to strip from WDA IPAs.
 * On iOS 17+, the embedded XCTest frameworks conflict with device-local ones,
 * causing black screen and immediate exit. The device uses its own copies at runtime.
 * Keep WebDriverAgentLib.framework (the actual WDA code).
 */
const STRIP_FRAMEWORK_RE =
  /\/Frameworks\/(?:XC[^/]*\.framework\/|Testing\.framework\/|libXCTestSwiftSupport\.dylib$)/

/**
 * Rewrite CFBundleIdentifier in an IPA's main app and all PlugIns/*.xctest
 * bundles so they share a consistent prefix.
 * Main app gets `newBundleId`; each plugin gets `${newBundleId}.${pluginName}`.
 * Uses JSZip for parse/modify/rebuild.
 * Returns the path to the new IPA (caller must clean up).
 */
export async function rewriteIpaBundleId(
  ipaPath: string,
  newBundleId: string
): Promise<string> {
  const zipData = await Bun.file(ipaPath).bytes()
  const zip = await JSZip.loadAsync(zipData)

  // Strip XCTest frameworks that conflict with device-local ones on iOS 17+
  const toRemove: string[] = []
  zip.forEach((path) => {
    if (STRIP_FRAMEWORK_RE.test(path)) {
      toRemove.push(path)
    }
  })
  for (const path of toRemove) {
    zip.remove(path)
  }

  let found = false
  const entries = Object.entries(zip.files)
  for (const [name, file] of entries) {
    if (file.dir) continue

    const pluginMatch = name.match(PLUGIN_INFO_PLIST_RE)
    const isMain = MAIN_INFO_PLIST_RE.test(name)
    if (!isMain && !pluginMatch) continue

    found = true
    const targetBundleId = isMain
      ? newBundleId
      : `${newBundleId}.${pluginMatch![1]!.toLowerCase()}`

    // Read and decompress
    const raw = new Uint8Array(await file.async('arraybuffer'))

    // Modify plist (handles both XML and binary bplist00 format)
    const plistObj = parsePlistBytes(raw)
    plistObj.CFBundleIdentifier = targetBundleId
    const newPlistStr = buildPlist(plistObj)

    // Write back
    zip.file(name, newPlistStr)
  }

  if (!found) {
    throw new Error(`No Info.plist found in IPA: ${ipaPath}`)
  }

  // Generate output
  const newZip = await zip.generateAsync({ type: 'uint8array' })
  const hex = [...crypto.getRandomValues(new Uint8Array(4))]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  const outputPath = join(tmpdir(), `tbana-wda-${hex}.ipa`)
  await Bun.write(outputPath, newZip)
  return outputPath
}
