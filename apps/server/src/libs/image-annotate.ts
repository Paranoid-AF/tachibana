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

  // Extract raw pixels (RGBA)
  const { data: rawPixels } = await sharp(imgBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = 4 // ensureAlpha guarantees RGBA
  const scale = imgW / wdaSize.width

  const results: string[] = []

  for (let i = 0; i < coordinates.length; i++) {
    const { x, y } = coordinates[i]

    let pixelX = Math.max(0, Math.min(Math.round(x * scale), imgW - 1))
    let pixelY = Math.max(0, Math.min(Math.round(y * scale), imgH - 1))

    const lineWidth = Math.max(2, Math.round(imgW / 400))
    const halfLW = Math.floor(lineWidth / 2)

    // Compute label rect bounds first so we can skip that area
    const fontSize = Math.max(16, Math.round(imgW / 30))
    const label = String(i)
    const rectW = Math.round(fontSize * (label.length * 0.7 + 1))
    const rectH = Math.round(fontSize * 1.5)
    const rectX = pixelX - Math.round(rectW / 2)
    const rectY = pixelY - Math.round(rectH / 2)
    const rectX2 = rectX + rectW
    const rectY2 = rectY + rectH

    // Clone pixel buffer
    const buf = Buffer.from(rawPixels)

    // Negate vertical line (full height), skip label rect
    for (let row = 0; row < imgH; row++) {
      if (row >= rectY && row < rectY2) continue
      for (let dx = -halfLW; dx < -halfLW + lineWidth; dx++) {
        const col = pixelX + dx
        if (col < 0 || col >= imgW) continue
        const off = (row * imgW + col) * channels
        buf[off] = 255 - buf[off]
        buf[off + 1] = 255 - buf[off + 1]
        buf[off + 2] = 255 - buf[off + 2]
      }
    }

    // Negate horizontal line (full width), skip label rect
    for (let col = 0; col < imgW; col++) {
      if (col >= rectX && col < rectX2) continue
      for (let dy = -halfLW; dy < -halfLW + lineWidth; dy++) {
        const row = pixelY + dy
        if (row < 0 || row >= imgH) continue
        const off = (row * imgW + col) * channels
        buf[off] = 255 - buf[off]
        buf[off + 1] = 255 - buf[off + 1]
        buf[off + 2] = 255 - buf[off + 2]
      }
    }

    const labelSvg = `<svg width="${imgW}" height="${imgH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" rx="4" fill="rgba(0,0,0,0.7)" />
  <text x="${pixelX}" y="${pixelY}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="white">${label}</text>
</svg>`

    const annotated = await sharp(buf, { raw: { width: imgW, height: imgH, channels } })
      .composite([{ input: Buffer.from(labelSvg), top: 0, left: 0 }])
      .png()
      .toBuffer()

    results.push(annotated.toString('base64'))
  }

  return results
}
