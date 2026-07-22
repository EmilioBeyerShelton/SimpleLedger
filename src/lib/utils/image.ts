// Client-side image downscale + recompress, used before a transaction
// photo ever reaches the store/SQLite (see rule in ARCHITECTURE.md:
// photos are compressed before they're written to the db, not after).
// Deliberately DOM-based (canvas/Image), unlike lib/utils/ledger.ts's pure
// functions — there's no way to resize/recompress an image without a
// decoder + canvas, and every platform this app runs on (a browser tab, an
// Electron renderer, an iOS WKWebView) is a full DOM environment, so one
// implementation covers all three; no adapter/platform split needed here.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.75;

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

/** Downscale (longest side to at most `maxDimension`) and recompress a
 * photo as JPEG, returning a `data:image/jpeg;base64,...` data URL. Accepts
 * anything a browser can decode as an image (a `File`/`Blob` from a file
 * input, or camera-plugin bytes wrapped in a Blob). */
export async function compressImage(
  source: Blob,
  { maxDimension = MAX_DIMENSION, quality = JPEG_QUALITY }: { maxDimension?: number; quality?: number } = {}
): Promise<string> {
  const decoded = await decodeImage(source);
  try {
    const { width, height } = decoded;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    // Flatten onto white first — JPEG has no alpha channel, and an
    // unpainted canvas is transparent-black, which would turn any
    // transparent source image (e.g. a PNG screenshot) black instead of
    // white once re-encoded as JPEG.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);

    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    decoded.cleanup();
  }
}

async function decodeImage(source: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(source);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, cleanup: () => bitmap.close() };
  }
  // Fallback for environments without createImageBitmap (older WKWebView):
  // decode via a plain <img>, which drawImage() also accepts directly.
  const url = URL.createObjectURL(source);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not decode image'));
    el.src = url;
  });
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, cleanup: () => URL.revokeObjectURL(url) };
}
