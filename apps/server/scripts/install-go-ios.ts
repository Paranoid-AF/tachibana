/**
 * Download the go-ios binary from GitHub releases and extract
 * the platform-specific binary into apps/server/bin/.
 *
 * On Windows, also downloads wintun.dll (required for iOS 17+ tunnel).
 */

import { existsSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platform, arch } from 'node:os'
import { inflateRawSync } from 'node:zlib'

const __dirname = dirname(fileURLToPath(import.meta.url))
const serverDir = join(__dirname, '..')
const binDir = join(serverDir, 'bin')

const GO_IOS_VERSION = '1.0.204'
const WINTUN_VERSION = '0.14.1'
const DDI_REPO_BASE =
  'https://raw.githubusercontent.com/doronz88/DeveloperDiskImage/main/PersonalizedImages/Xcode_iOS_DDI_Personalized'

/** GitHub release asset names per platform. */
const GH_PLATFORM_MAP: Record<string, string> = {
  darwin: 'mac',
  linux: 'linux',
  win32: 'win',
}

/** Extract a single file from a .zip buffer by entry path. */
function extractFileFromZip(zipBuf: Buffer, entryPath: string): Buffer | null {
  let offset = 0
  while (offset + 30 <= zipBuf.length) {
    // Local file header signature: PK\x03\x04
    if (
      zipBuf[offset] !== 0x50 ||
      zipBuf[offset + 1] !== 0x4b ||
      zipBuf[offset + 2] !== 0x03 ||
      zipBuf[offset + 3] !== 0x04
    )
      break

    const method = zipBuf.readUInt16LE(offset + 8)
    const compressedSize = zipBuf.readUInt32LE(offset + 18)
    const nameLen = zipBuf.readUInt16LE(offset + 26)
    const extraLen = zipBuf.readUInt16LE(offset + 28)
    const name = zipBuf
      .subarray(offset + 30, offset + 30 + nameLen)
      .toString('utf-8')
    const dataStart = offset + 30 + nameLen + extraLen

    if (name === entryPath) {
      const raw = zipBuf.subarray(dataStart, dataStart + compressedSize)
      if (method === 0) return Buffer.from(raw) // stored
      if (method === 8) return inflateRawSync(raw) // deflated
      throw new Error(`Unsupported zip compression method ${method}`)
    }
    offset = dataStart + compressedSize
  }
  return null
}

const ghPlatform = GH_PLATFORM_MAP[platform()]

if (!ghPlatform) {
  console.error(
    `[go-ios] Unsupported platform: ${platform()}, skipping.`
  )
  process.exit(0)
}

const binName = platform() === 'win32' ? 'ios.exe' : 'ios'
const destPath = join(binDir, binName)

mkdirSync(binDir, { recursive: true })

// ── go-ios binary ───────────────────────────────────────────────────────

if (existsSync(destPath)) {
  console.log(`[go-ios] Binary already exists at ${destPath}, skipping.`)
} else {
  const zipUrl =
    `https://github.com/danielpaulus/go-ios/releases/download/` +
    `v${GO_IOS_VERSION}/go-ios-${ghPlatform}.zip`
  console.log(`[go-ios] Downloading ${zipUrl}`)

  const res = await fetch(zipUrl, { redirect: 'follow' })
  if (!res.ok) {
    console.error(`[go-ios] Failed to download release zip: ${res.status}`)
    process.exit(1)
  }
  const zipBuf = Buffer.from(await res.arrayBuffer())

  const extracted = extractFileFromZip(zipBuf, binName)
  if (extracted) {
    writeFileSync(destPath, extracted)
  }

  if (!existsSync(destPath)) {
    console.error(
      `[go-ios] Binary not found after extraction. Expected "${binName}" in zip.`
    )
    process.exit(1)
  }

  if (platform() !== 'win32') {
    chmodSync(destPath, 0o755)
  }

  console.log(`[go-ios] Installed ${binName} to ${binDir}`)
}

// ── wintun.dll (Windows only) ───────────────────────────────────────────

if (platform() === 'win32') {
  const wintunPath = join(binDir, 'wintun.dll')
  if (existsSync(wintunPath)) {
    console.log(`[go-ios] wintun.dll already exists, skipping.`)
  } else {
    const wintunUrl = `https://www.wintun.net/builds/wintun-${WINTUN_VERSION}.zip`
    console.log(`[go-ios] Downloading wintun ${WINTUN_VERSION}...`)

    const wintunRes = await fetch(wintunUrl)
    if (!wintunRes.ok) {
      console.error(
        `[go-ios] Failed to download wintun: ${wintunRes.status}. ` +
          `You can manually download it from https://www.wintun.net/ ` +
          `and place wintun.dll next to ios.exe.`
      )
    } else {
      const zipBuf = Buffer.from(await wintunRes.arrayBuffer())

      const wintunArch = arch() === 'ia32' ? 'x86' : arch() === 'x64' ? 'amd64' : arch()
      const zipEntry = `wintun/bin/${wintunArch}/wintun.dll`

      try {
        const dll = extractFileFromZip(zipBuf, zipEntry)
        if (!dll) throw new Error(`Entry "${zipEntry}" not found in zip`)
        writeFileSync(wintunPath, dll)
        console.log(`[go-ios] Installed wintun.dll to ${binDir}`)
      } catch {
        console.error(
          `[go-ios] Failed to extract wintun.dll. ` +
            `You can manually download it from https://www.wintun.net/ ` +
            `and place wintun.dll (${wintunArch}) next to ios.exe.`
        )
      }
    }
  }
}

// ── Developer Disk Image (DDI) ────────────────────────────────────────

const ddiDir = join(binDir, 'ddi')
const ddiManifest = join(ddiDir, 'BuildManifest.plist')

if (existsSync(ddiManifest)) {
  console.log(`[go-ios] DDI already exists at ${ddiDir}, skipping.`)
} else {
  console.log(`[go-ios] Downloading Developer Disk Image...`)
  mkdirSync(join(ddiDir, 'Firmware'), { recursive: true })

  const files = [
    { name: 'BuildManifest.plist', dest: join(ddiDir, 'BuildManifest.plist') },
    { name: 'Image.dmg', dest: join(ddiDir, 'Image.dmg') },
    {
      name: 'Image.dmg.trustcache',
      dest: join(ddiDir, 'Image.dmg.trustcache'),
    },
  ]

  let ddiOk = true
  for (const f of files) {
    const url = `${DDI_REPO_BASE}/${f.name}`
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`[go-ios] Failed to download ${f.name}: ${res.status}`)
      ddiOk = false
      break
    }
    writeFileSync(f.dest, Buffer.from(await res.arrayBuffer()))
    console.log(`[go-ios]   ${f.name} downloaded`)
  }

  if (ddiOk) {
    // go-ios expects filenames from BuildManifest.plist — create copies
    // with the expected names (022-20522-020.dmg, Firmware/022-20522-020.dmg.trustcache)
    const { readFileSync: readFile } = await import('node:fs')
    const manifest = readFile(join(ddiDir, 'BuildManifest.plist'), 'utf-8')
    const dmgMatch = manifest.match(/<string>(\d{3}-\d{5}-\d{3}\.dmg)<\/string>/)
    if (dmgMatch) {
      const dmgName = dmgMatch[1]
      const { copyFileSync } = await import('node:fs')
      copyFileSync(join(ddiDir, 'Image.dmg'), join(ddiDir, dmgName))
      copyFileSync(
        join(ddiDir, 'Image.dmg.trustcache'),
        join(ddiDir, 'Firmware', `${dmgName}.trustcache`)
      )
      console.log(`[go-ios]   Created ${dmgName} aliases for go-ios`)
    }
    console.log(`[go-ios] DDI installed to ${ddiDir}`)
  }
}
