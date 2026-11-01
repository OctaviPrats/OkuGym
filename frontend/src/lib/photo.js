// Photos for AI meal estimates. They're shrunk on the device before they're sent, so an
// estimate uploads ~100–200 KB instead of a camera's 3–5 MB, quickly on mobile data and at a
// fraction of the image tokens. 1024 px still shows a plate, a menu or a nutrition label clearly.

export const PHOTO_MAX = 1024

// The size that fits within `max` px on the long side, keeping the shape. Never enlarges.
export function fitWithin(w, h, max = PHOTO_MAX) {
  const k = Math.min(1, max / Math.max(w, h, 1))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable photo')) }
    img.src = url
  })
}

// A picked or taken photo as a JPEG data URL, at most `max` px on its long side and the right
// way up (both decoders apply the camera's EXIF orientation). Rejects when it can't be read.
export async function shrinkPhoto(file, max = PHOTO_MAX, quality = 0.8) {
  let src
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch (e) { src = await loadImage(file) }
  const { w, h } = fitWithin(src.width, src.height, max)
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  c.getContext('2d').drawImage(src, 0, 0, w, h)
  if (src.close) src.close()
  return c.toDataURL('image/jpeg', quality)
}
