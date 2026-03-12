/**
 * Download the go-ios binary from GitHub releases and extract
 * the platform-specific binary into apps/server/bin/.
 *
 * On Windows, also downloads wintun.dll (required for iOS 17+ tunnel).
 */

import JSZip from 'jszip'
import { join } from 'node:path'
import { mkdir, chmod } from 'node:fs/promises'

const __dirname = import.meta.dirname!
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
async function extractFileFromZip(
  zipData: Uint8Array,
  entryPath: string
): Promise<Uint8Array | null> {
  const zip = await JSZip.loadAsync(zipData)
  const file = zip.file(entryPath)
  if (!file) return null
  return new Uint8Array(await file.async('arraybuffer'))
}

const ghPlatform = GH_PLATFORM_MAP[process.platform]

if (!ghPlatform) {
  console.error(`[go-ios] Unsupported platform: ${process.platform}, skipping.`)
  process.exit(0)
}

const binName = process.platform === 'win32' ? 'ios.exe' : 'ios'
const destPath = join(binDir, binName)

await mkdir(binDir, { recursive: true })

// ── go-ios binary ───────────────────────────────────────────────────────

if (await Bun.file(destPath).exists()) {
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
  const zipData = new Uint8Array(await res.arrayBuffer())

  const extracted = await extractFileFromZip(zipData, binName)
  if (extracted) {
    await Bun.write(destPath, extracted)
  }

  if (!(await Bun.file(destPath).exists())) {
    console.error(
      `[go-ios] Binary not found after extraction. Expected "${binName}" in zip.`
    )
    process.exit(1)
  }

  if (process.platform !== 'win32') {
    await chmod(destPath, 0o755)
  }

  console.log(`[go-ios] Installed ${binName} to ${binDir}`)
}

// ── wintun.dll (Windows only) ───────────────────────────────────────────

if (process.platform === 'win32') {
  const wintunPath = join(binDir, 'wintun.dll')
  if (await Bun.file(wintunPath).exists()) {
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
      const zipData = new Uint8Array(await wintunRes.arrayBuffer())

      const wintunArch =
        process.arch === 'ia32'
          ? 'x86'
          : process.arch === 'x64'
            ? 'amd64'
            : process.arch
      const zipEntry = `wintun/bin/${wintunArch}/wintun.dll`

      try {
        const dll = await extractFileFromZip(zipData, zipEntry)
        if (!dll) throw new Error(`Entry "${zipEntry}" not found in zip`)
        await Bun.write(wintunPath, dll)
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

if (await Bun.file(ddiManifest).exists()) {
  console.log(`[go-ios] DDI already exists at ${ddiDir}, skipping.`)
} else {
  console.log(`[go-ios] Downloading Developer Disk Image...`)
  await mkdir(join(ddiDir, 'Firmware'), { recursive: true })

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
    await Bun.write(f.dest, new Uint8Array(await res.arrayBuffer()))
    console.log(`[go-ios]   ${f.name} downloaded`)
  }

  if (ddiOk) {
    // go-ios expects filenames from BuildManifest.plist — create copies
    // with the expected names (022-20522-020.dmg, Firmware/022-20522-020.dmg.trustcache)
    const manifest = await Bun.file(join(ddiDir, 'BuildManifest.plist')).text()
    const dmgMatch = manifest.match(
      /<string>(\d{3}-\d{5}-\d{3}\.dmg)<\/string>/
    )
    if (dmgMatch) {
      const dmgName = dmgMatch[1]
      await Bun.write(
        join(ddiDir, dmgName),
        Bun.file(join(ddiDir, 'Image.dmg'))
      )
      await Bun.write(
        join(ddiDir, 'Firmware', `${dmgName}.trustcache`),
        Bun.file(join(ddiDir, 'Image.dmg.trustcache'))
      )
      console.log(`[go-ios]   Created ${dmgName} aliases for go-ios`)
    }
    console.log(`[go-ios] DDI installed to ${ddiDir}`)
  }
}
