/**
 * IPA utilities: metadata extraction and bundle ID rewriting.
 * Pure JS ZIP handling — no shell commands.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { parsePlist, buildPlist } from './plist.ts'

/** Minimal IPA metadata extracted from Info.plist */
export interface IpaMetadata {
  bundleId: string
  bundleName: string
  bundleVersion: string
  executableName: string
}

/**
 * Extract metadata from an IPA file by reading Info.plist from the zip.
 * Uses manual zip parsing to avoid full extraction.
 */
export async function extractIpaMetadata(
  ipaPath: string
): Promise<IpaMetadata> {
  // IPAs are zip files with structure: Payload/<AppName>.app/Info.plist
  const ipaData = await readFile(ipaPath)
  const entries = await findInfoPlist(ipaData)
  if (!entries) {
    throw new Error(`No Info.plist found in IPA: ${ipaPath}`)
  }

  const plistData = parsePlist<Record<string, string>>(entries)

  return {
    bundleId: plistData.CFBundleIdentifier ?? '',
    bundleName: plistData.CFBundleName ?? plistData.CFBundleDisplayName ?? '',
    bundleVersion: plistData.CFBundleShortVersionString ?? '',
    executableName: plistData.CFBundleExecutable ?? '',
  }
}

/**
 * Find and extract Info.plist from IPA zip data.
 * Minimal zip parsing — looks for the Info.plist local file entry.
 */
async function findInfoPlist(zipData: Buffer): Promise<string | null> {
  // ZIP local file header signature: PK\x03\x04
  const LOCAL_FILE_SIG = 0x04034b50
  let offset = 0

  while (offset < zipData.length - 4) {
    const sig = zipData.readUInt32LE(offset)
    if (sig !== LOCAL_FILE_SIG) break

    const compressedSize = zipData.readUInt32LE(offset + 18)
    const uncompressedSize = zipData.readUInt32LE(offset + 22)
    const nameLength = zipData.readUInt16LE(offset + 26)
    const extraLength = zipData.readUInt16LE(offset + 28)
    const compressionMethod = zipData.readUInt16LE(offset + 8)

    const nameStart = offset + 30
    const name = zipData
      .subarray(nameStart, nameStart + nameLength)
      .toString('utf-8')

    const dataStart = nameStart + nameLength + extraLength

    // Match Payload/*.app/Info.plist (top-level Info.plist in the .app bundle)
    if (/^Payload\/[^/]+\.app\/Info\.plist$/.test(name)) {
      if (compressionMethod === 0) {
        // Stored (no compression)
        return zipData
          .subarray(dataStart, dataStart + uncompressedSize)
          .toString('utf-8')
      } else if (compressionMethod === 8) {
        // Deflate
        const compressed = zipData.subarray(
          dataStart,
          dataStart + compressedSize
        )
        return Buffer.from(
          Bun.inflateSync(compressed as Uint8Array<ArrayBuffer>)
        ).toString('utf-8')
      }
    }

    offset = dataStart + compressedSize
  }

  return null
}

// ── ZIP rewriting ──────────────────────────────────────────────────────────

/** Parsed ZIP entry with raw compressed data preserved */
interface ZipEntry {
  name: string
  compressionMethod: number
  crc32: number
  compressedData: Uint8Array
  uncompressedSize: number
}

const INFO_PLIST_RE = /^Payload\/[^/]+\.app\/Info\.plist$/

/**
 * Rewrite the CFBundleIdentifier inside an IPA's Info.plist.
 * Pure JS — parses ZIP via central directory, modifies plist, rebuilds ZIP.
 * Returns the path to the new IPA (caller must clean up).
 */
export async function rewriteIpaBundleId(
  ipaPath: string,
  newBundleId: string
): Promise<string> {
  const zipData = await readFile(ipaPath)
  const entries = parseZipEntries(zipData)

  // Find and modify Info.plist
  let found = false
  for (const entry of entries) {
    if (!INFO_PLIST_RE.test(entry.name)) continue
    found = true

    // Decompress
    const raw =
      entry.compressionMethod === 8
        ? Bun.inflateSync(entry.compressedData as Uint8Array<ArrayBuffer>)
        : entry.compressedData

    // Modify plist
    const plistObj = parsePlist<Record<string, unknown>>(
      Buffer.from(raw).toString('utf-8')
    )
    plistObj.CFBundleIdentifier = newBundleId
    const newPlist = new Uint8Array(Buffer.from(buildPlist(plistObj), 'utf-8'))

    // Recompress with deflate
    const newCompressed = Bun.deflateSync(newPlist)
    entry.compressedData = newCompressed
    entry.uncompressedSize = newPlist.length
    entry.compressionMethod = 8
    entry.crc32 = crc32(newPlist)
    break
  }

  if (!found) {
    throw new Error(`No Info.plist found in IPA: ${ipaPath}`)
  }

  // Rebuild ZIP
  const newZip = buildZip(entries)
  const outputPath = join(
    tmpdir(),
    `tbana-wda-${randomBytes(4).toString('hex')}.ipa`
  )
  await writeFile(outputPath, newZip)
  return outputPath
}

/**
 * Parse ZIP entries via the central directory (reliable for all ZIP files).
 * Keeps raw compressed data for each entry — no unnecessary decompression.
 */
function parseZipEntries(zip: Buffer): ZipEntry[] {
  // Find End of Central Directory record (scan backwards)
  let eocdOffset = -1
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset === -1) throw new Error('Invalid ZIP: no EOCD record')

  const entryCount = zip.readUInt16LE(eocdOffset + 10)
  const centralDirOffset = zip.readUInt32LE(eocdOffset + 16)

  const entries: ZipEntry[] = []
  let offset = centralDirOffset

  for (let i = 0; i < entryCount; i++) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Invalid central directory entry')
    }

    const compressionMethod = zip.readUInt16LE(offset + 10)
    const entryCrc32 = zip.readUInt32LE(offset + 16)
    const compressedSize = zip.readUInt32LE(offset + 20)
    const uncompressedSize = zip.readUInt32LE(offset + 24)
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const localHeaderOffset = zip.readUInt32LE(offset + 42)

    const name = zip
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf-8')

    // Read compressed data from local file entry
    const localNameLen = zip.readUInt16LE(localHeaderOffset + 26)
    const localExtraLen = zip.readUInt16LE(localHeaderOffset + 28)
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen

    const compressedData = new Uint8Array(
      zip.buffer,
      zip.byteOffset + dataOffset,
      compressedSize
    )

    entries.push({
      name,
      compressionMethod,
      crc32: entryCrc32,
      compressedData: Uint8Array.from(compressedData),
      uncompressedSize,
    })

    offset += 46 + nameLength + extraLength + commentLength
  }

  return entries
}

/** Rebuild a ZIP file from entries */
function buildZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = []
  const centralParts: Uint8Array[] = []
  let localOffset = 0

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf-8')

    // Local file header (30 bytes fixed + name + data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // signature
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(entry.compressionMethod, 8)
    local.writeUInt16LE(0, 10) // mod time
    local.writeUInt16LE(0, 12) // mod date
    local.writeUInt32LE(entry.crc32, 14)
    local.writeUInt32LE(entry.compressedData.length, 18)
    local.writeUInt32LE(entry.uncompressedSize, 22)
    local.writeUInt16LE(nameBytes.length, 26)
    local.writeUInt16LE(0, 28) // extra length

    localParts.push(local, nameBytes, entry.compressedData)

    // Central directory entry (46 bytes fixed + name)
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0) // signature
    cd.writeUInt16LE(20, 4) // version made by
    cd.writeUInt16LE(20, 6) // version needed
    cd.writeUInt16LE(0, 8) // flags
    cd.writeUInt16LE(entry.compressionMethod, 10)
    cd.writeUInt16LE(0, 12) // mod time
    cd.writeUInt16LE(0, 14) // mod date
    cd.writeUInt32LE(entry.crc32, 16)
    cd.writeUInt32LE(entry.compressedData.length, 20)
    cd.writeUInt32LE(entry.uncompressedSize, 24)
    cd.writeUInt16LE(nameBytes.length, 28)
    cd.writeUInt16LE(0, 30) // extra length
    cd.writeUInt16LE(0, 32) // comment length
    cd.writeUInt16LE(0, 34) // disk number start
    cd.writeUInt16LE(0, 36) // internal attrs
    cd.writeUInt32LE(0, 38) // external attrs
    cd.writeUInt32LE(localOffset, 42) // offset to local header

    centralParts.push(cd, nameBytes)

    localOffset += local.length + nameBytes.length + entry.compressedData.length
  }

  // End of Central Directory
  const cdSize = centralParts.reduce((s, b) => s + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // disk with central dir
  eocd.writeUInt16LE(entries.length, 8) // entries on disk
  eocd.writeUInt16LE(entries.length, 10) // total entries
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(localOffset, 16) // central dir offset
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...localParts, ...centralParts, eocd])
}

// ── CRC-32 (standard polynomial 0xEDB88320, same as ZIP) ──────────────────

const CRC_TABLE = /* @__PURE__ */ (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
