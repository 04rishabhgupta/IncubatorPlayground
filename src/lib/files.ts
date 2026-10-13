import { LOGO_MAX_BYTES, LOGO_MIME_TYPES } from "@/lib/validation/auth";

type ImageCheck =
  { ok: true; mime: (typeof LOGO_MIME_TYPES)[number]; ext: string } | { ok: false; error: string };

/**
 * Validates an uploaded image by size and by its leading bytes (not the
 * client-supplied MIME type, which is trivially spoofed).
 */
export async function checkLogoFile(file: File): Promise<ImageCheck> {
  if (file.size === 0) return { ok: false, error: "The selected file is empty." };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, error: "The logo must be 2 MB or smaller." };

  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...head.slice(start, end));

  if (head[0] === 0x89 && ascii(1, 4) === "PNG") return { ok: true, mime: "image/png", ext: "png" };
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return { ok: true, mime: "image/jpeg", ext: "jpg" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { ok: true, mime: "image/webp", ext: "webp" };

  return { ok: false, error: "Upload a PNG, JPEG or WebP image." };
}
