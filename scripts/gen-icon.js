const sharp = require('sharp')
const pngToIco = require('png-to-ico')
const fs = require('fs')
const path = require('path')

async function main() {
  const src = path.join(__dirname, '..', 'build', 'icon.png')
  const tmpDir = path.join(__dirname, '..', 'build')

  // Read original image metadata
  const meta = await sharp(src).metadata()
  console.log(`Source: ${meta.width}x${meta.height}, channels: ${meta.channels}, format: ${meta.format}`)

  // Create a circular mask with transparent background at 256x256
  const size = 256
  const radius = size / 2

  // Create circle SVG mask
  const circleSvg = Buffer.from(`
    <svg width="${size}" height="${size}">
      <circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/>
    </svg>
  `)

  // Resize the source image and apply circular mask
  const resized = await sharp(src)
    .resize(size, size, { fit: 'cover' })
    .ensureAlpha()
    .toBuffer()

  const mask = await sharp(circleSvg)
    .resize(size, size)
    .greyscale()
    .toBuffer()

  const circularPng = await sharp(resized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  // Save the circular PNG
  const circularPath = path.join(tmpDir, 'icon_circular_256.png')
  fs.writeFileSync(circularPath, circularPng)
  console.log('Created circular PNG:', circularPath)

  // Convert to ICO
  const icoBuf = await pngToIco(circularPath)
  const icoPath = path.join(tmpDir, 'icon.ico')
  fs.writeFileSync(icoPath, icoBuf)
  console.log('Created ICO:', icoBuf.length, 'bytes')
}

main().catch(console.error)
