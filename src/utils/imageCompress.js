// Shrinks a photo/screenshot picked on the phone to something safe to upload
// (the server accepts ~2.7 MB; Vercel caps request bodies at ~4.5 MB). Screenshots
// of text stay readable at 1800px on the long edge, JPEG quality ~0.85.
// Returns { contentType, data } where data is base64 WITHOUT the data: prefix.

const MAX_EDGE = 1800
const MAX_CHARS = 3_000_000 // base64 chars; keeps well under the server limit

function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadViaImg(file))
  }
  return loadViaImg(file)
}

function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    img.src = url
  })
}

export async function compressImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Please choose an image')
  const bmp = await loadBitmap(file)
  const w0 = bmp.width, h0 = bmp.height
  let scale = Math.min(1, MAX_EDGE / Math.max(w0, h0))
  let quality = 0.85

  for (let attempt = 0; attempt < 5; attempt++) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w0 * scale)
    canvas.height = Math.round(h0 * scale)
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff' // flatten transparency (PNG screenshots) before JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const data = dataUrl.slice(dataUrl.indexOf(',') + 1)
    if (data.length <= MAX_CHARS) return { contentType: 'image/jpeg', data }
    scale *= 0.8
    quality = Math.max(0.6, quality - 0.08)
  }
  throw new Error('Image is too large to upload')
}
