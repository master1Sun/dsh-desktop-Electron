/**
 * Build the app icon set from a source image (a square PNG of the whale).
 *
 * Watermark bands baked into generated artwork are cropped by scaling the
 * source so the remaining square covers the canvas, then center-cropping.
 *
 * usage: node tools/build-icon.cjs <source.png> [shrinkRatio=0.86]
 */
const path = require('node:path')
const { existsSync } = require('node:fs')
const fs = require('node:fs/promises')
const sharp = require('sharp')

const repoRoot = path.join(__dirname, '..')
const source = process.argv[2]
const shrink = Number(process.argv[3] || 0.86)
if (!source || !existsSync(path.resolve(source))) {
  console.error('usage: node tools/build-icon.cjs <source.png> [shrinkRatio]')
  process.exit(1)
}

const PNG_SIZES = [16, 32, 64, 128, 256, 512, 1024]

async function build() {
  const meta = await sharp(source).metadata()
  const side = Math.min(meta.width, meta.height)
  const crop = Math.round(side * shrink)
  const off = Math.round((side - crop) / 2)
  const square = await sharp(source)
    .extract({ left: off, top: off, width: crop, height: crop })
    .resize(1024, 1024)
    .png()
    .toBuffer()

  const pngs = []
  for (const size of PNG_SIZES) {
    const buf = await sharp(square).resize(size, size).png().toBuffer()
    pngs.push({ size, buf })
    if (size === 512) await sharp(buf).toFile(path.join(repoRoot, 'resources', 'icon.png'))
  }

  const pngEntries = []
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    pngEntries.push({ size, buf: await sharp(square).resize(size, size).png().toBuffer() })
  }
  // PNG-in-ICO: valid since Vista, and keeps the 256px entry lossless
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngEntries.length, 4)
  let offset = header.length + pngEntries.length * 16
  const entries = Buffer.alloc(pngEntries.length * 16)
  pngEntries.forEach((e, i) => {
    const at = i * 16
    entries.writeUInt8(e.size === 256 ? 0 : e.size, at)
    entries.writeUInt8(e.size === 256 ? 0 : e.size, at + 1)
    entries.writeUInt16LE(1, at + 4)
    entries.writeUInt16LE(32, at + 6)
    entries.writeUInt32LE(e.buf.length, at + 8)
    entries.writeUInt32LE(offset, at + 12)
    offset += e.buf.length
  })
  await fs.writeFile(
    path.join(repoRoot, 'build', 'icon.ico'),
    Buffer.concat([header, entries, ...pngEntries.map((e) => e.buf)])
  )

  console.log(`icon written: resources/icon.png + build/icon.ico (${pngEntries.length} sizes)`)
}

build().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
