import sharp from 'sharp'

export async function annotateScreenshot(
  screenshotBase64: string,
  coordinates: Array<{ x: number; y: number }>,
  wdaSize: { width: number; height: number }
): Promise<string[]> {
  const imgBuf = Buffer.from(screenshotBase64, 'base64')
  const metadata = await sharp(imgBuf).metadata()
  const imgW = metadata.width!
  const imgH = metadata.height!

  // Extract raw pixels for color sampling
  const { data: rawPixels, info } = await sharp(imgBuf)
    .raw()
    .toBuffer({ resolveWithObject: true })

  const scale = imgW / wdaSize.width
  const channels = info.channels

  const results: string[] = []

  for (let i = 0; i < coordinates.length; i++) {
    const { x, y } = coordinates[i]

    // Convert WDA points → pixel coordinates
    let pixelX = Math.round(x * scale)
    let pixelY = Math.round(y * scale)

    // Clamp to image bounds
    pixelX = Math.max(0, Math.min(pixelX, imgW - 1))
    pixelY = Math.max(0, Math.min(pixelY, imgH - 1))

    // Sample pixel color at the coordinate
    const offset = (pixelY * imgW + pixelX) * channels
    const r = rawPixels[offset]
    const g = rawPixels[offset + 1]
    const b = rawPixels[offset + 2]

    // Negative color for maximum contrast
    const nr = 255 - r
    const ng = 255 - g
    const nb = 255 - b
    const negColor = `rgb(${nr},${ng},${nb})`

    // Proportional sizing
    const lineWidth = Math.max(2, Math.round(imgW / 400))
    const fontSize = Math.max(16, Math.round(imgW / 30))
    const label = String(i)
    const rectW = Math.round(fontSize * (label.length * 0.7 + 1))
    const rectH = Math.round(fontSize * 1.5)
    const rectX = pixelX - Math.round(rectW / 2)
    const rectY = pixelY - Math.round(rectH / 2)

    const svg = `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${pixelX}" y1="0" x2="${pixelX}" y2="${imgH}" stroke="${negColor}" stroke-width="${lineWidth}" />
  <line x1="0" y1="${pixelY}" x2="${imgW}" y2="${pixelY}" stroke="${negColor}" stroke-width="${lineWidth}" />
  <rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" fill="white" />
  <text x="${pixelX}" y="${pixelY}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="${negColor}">${label}</text>
</svg>`

    const annotated = await sharp(imgBuf)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png()
      .toBuffer()

    results.push(annotated.toString('base64'))
  }

  return results
}
