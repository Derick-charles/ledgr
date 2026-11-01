import { MAX_UPLOAD_BYTES } from '../api.js';

// Shrinks a screenshot/photo in the browser before upload: caps the longest
// side and re-encodes as JPEG, which turns a 6–10MB retina screenshot into a
// few hundred KB and keeps it under the 4.5MB Netlify Functions limit.
//
// Left alone: videos, GIFs (would lose the animation), SVGs, anything the
// browser can't decode (e.g. HEIC on some browsers), small files already
// under ~400KB, and any case where re-encoding wouldn't actually be smaller.
const MAX_DIMENSION = 2400;
const SKIP_BELOW_BYTES = 400 * 1024;

function toBlob(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function compressImage(file) {
  if (!file.type.startsWith('image/') || /gif|svg/.test(file.type)) return file;

  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }

  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_DIMENSION && file.size <= SKIP_BELOW_BYTES) return file;

    let scale = Math.min(1, MAX_DIMENSION / longest);
    let quality = 0.88;
    let best = null;
    // A few passes: if the result is still over the upload limit, shrink further.
    for (let pass = 0; pass < 4; pass++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // JPEG has no transparency — flatten onto white
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await toBlob(canvas, quality);
      if (!blob) break;
      best = blob;
      if (blob.size <= MAX_UPLOAD_BYTES * 0.9) break;
      scale *= 0.8; quality = Math.max(0.6, quality - 0.08);
    }
    if (!best || (best.size >= file.size && file.size <= MAX_UPLOAD_BYTES)) return file;
    return new File([best], `${file.name.replace(/\.[^.]+$/, '') || 'image'}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    if (bitmap.close) bitmap.close();
  }
}
