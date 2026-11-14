import "server-only";
import sharp from "sharp";
import { fetchImmutable } from "../gallery";

// What the wall needs from each image: its proportions, and a colour taken from the painting for
// the hover glow and caption tint.
export type ImageInfo = { ratio: number; tone: string };

// Originals are up to ~8 MB. The Pinata gateway resizes on request (img-width), and a 160 px copy
// (a few kB) gives the ratio within ~0.5% and the colour. Anything large means the gateway didn't
// resize; give up rather than pull the original on every snapshot.
const PREVIEW_WIDTH = 160;
const MAX_PREVIEW_BYTES = 2_000_000;

export async function analyseImage(url: string): Promise<ImageInfo | null> {
  try {
    const preview = new URL(url);
    preview.searchParams.set("img-width", String(PREVIEW_WIDTH));
    const res = await fetchImmutable(preview);
    if (!res.ok || Number(res.headers.get("content-length") ?? 0) > MAX_PREVIEW_BYTES) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_PREVIEW_BYTES) return null;
    const image = sharp(bytes).autoOrient();
    const { width, height } = await image.metadata();
    const { data } = await image.resize(24, 24, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return width && height ? { ratio: width / height, tone: tone(data) } : null;
  } catch {
    return null;
  }
}

// sharp's stats().dominant lands on the darkest bin for most old paintings (varnish, shadows).
// Instead: average the pixels weighted by saturation, then lift saturation and clamp lightness
// so the result reads as a colour on both themes.
function tone(rgb: Buffer): string {
  let r = 0, g = 0, b = 0, w = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const k = (Math.max(rgb[i], rgb[i + 1], rgb[i + 2]) - Math.min(rgb[i], rgb[i + 1], rgb[i + 2])) / 255 + 0.05;
    r += rgb[i] * k;
    g += rgb[i + 1] * k;
    b += rgb[i + 2] * k;
    w += k;
  }
  [r, g, b] = [r / w, g / w, b / w];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 510;
  const s = d === 0 ? 0 : d / (255 - Math.abs(max + min - 255));
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const pct = (x: number) => Math.round(x * 100);
  return `hsl(${Math.round(h * 60)} ${pct(Math.min(1, s * 1.6 + 0.15))}% ${pct(Math.min(0.55, Math.max(0.38, l)))}%)`;
}
