import sharp from 'sharp'

export interface AnnotatedCoordinate {
  full: string // base64 PNG — full screenshot with crosshair (at control space resolution)
  crop: string // base64 PNG — cropped close-up around intersection
}

// Crop radius in WDA points (= pixels after resize to control space)
const CROP_RADIUS_PT = 80

/**
 * Resize a screenshot to match the WDA control coordinate space so that
 * pixel coordinates equal control coordinates (scale = 1).
 */
export async function resizeToControlSpace(
  screenshotBase64: string,
  wdaSize: { width: number; height: number }
): Promise<Buffer> {
  const imgBuf = Buffer.from(screenshotBase64, 'base64')
  return sharp(imgBuf)
    .resize(wdaSize.width, wdaSize.height, { fit: 'fill' })
    .png()
    .toBuffer()
}

export async function annotateScreenshot(
  screenshotBase64: string,
  coordinates: Array<{ x: number; y: number }>,
  wdaSize: { width: number; height: number }
): Promise<AnnotatedCoordinate[]> {
  // Resize to control space so pixel coords = WDA point coords (scale = 1)
  const resizedBuf = await resizeToControlSpace(screenshotBase64, wdaSize)
  const imgW = wdaSize.width
  const imgH = wdaSize.height

  // Extract raw pixels (RGBA)
  const { data: rawPixels } = await sharp(resizedBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = 4 // ensureAlpha guarantees RGBA
  const cropRadiusPx = CROP_RADIUS_PT // scale = 1, so points = pixels

  const results: AnnotatedCoordinate[] = []

  for (let i = 0; i < coordinates.length; i++) {
    const { x, y } = coordinates[i]

    // scale = 1 (image was resized to control space), so pixel coords = WDA points
    const pixelX = Math.max(0, Math.min(Math.round(x), imgW - 1))
    const pixelY = Math.max(0, Math.min(Math.round(y), imgH - 1))

    const lineWidth = Math.max(2, Math.round(imgW / 400))
    const halfLW = Math.floor(lineWidth / 2)

    // Compute label rect bounds first so we can skip that area
    const fontSize = Math.max(16, Math.round(imgW / 30))
    const label = `#${i} (${x},${y})`
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

    const annotatedBuf = await sharp(buf, {
      raw: { width: imgW, height: imgH, channels },
    })
      .composite([{ input: Buffer.from(labelSvg), top: 0, left: 0 }])
      .png()
      .toBuffer()

    // Crop close-up around intersection
    const cropLeft = Math.max(0, pixelX - cropRadiusPx)
    const cropTop = Math.max(0, pixelY - cropRadiusPx)
    const cropRight = Math.min(imgW, pixelX + cropRadiusPx)
    const cropBottom = Math.min(imgH, pixelY + cropRadiusPx)

    const cropBuf = await sharp(annotatedBuf)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: cropRight - cropLeft,
        height: cropBottom - cropTop,
      })
      .png()
      .toBuffer()

    results.push({
      full: annotatedBuf.toString('base64'),
      crop: cropBuf.toString('base64'),
    })
  }

  return results
}
