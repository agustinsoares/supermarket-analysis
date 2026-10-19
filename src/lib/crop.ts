import sharp from "sharp";

export type Box = [number, number, number, number]; // [ymin, xmin, ymax, xmax], escala 0-1000

/** Valida la caja que devuelve el modelo; null si no es utilizable. */
export function validBox(b: number[] | undefined): Box | null {
  if (!b || b.length !== 4 || b.some((n) => !Number.isFinite(n) || n < 0 || n > 1000)) return null;
  const [y0, x0, y1, x1] = b;
  if (y1 <= y0 || x1 <= x0) return null;
  const area = ((y1 - y0) * (x1 - x0)) / 1_000_000;
  if (area < 0.002 || area > 0.6) return null; // diminuta o casi toda la página: no es un producto
  return [y0, x0, y1, x1];
}

/** Orienta según EXIF y devuelve los bytes que verá la IA (los recortes salen de esta misma imagen). */
export async function normalizeImage(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes).rotate().toBuffer();
}

/** Recorta la caja (con un pequeño margen) y la devuelve como WebP de hasta 640 px de ancho. */
export async function cropToWebp(image: Buffer, box: Box): Promise<Buffer | null> {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  if (!width || !height) return null;
  const pad = 0.012; // 1,2 % de margen por lado
  const [y0, x0, y1, x1] = box;
  const left = Math.max(0, Math.floor((x0 / 1000 - pad) * width));
  const top = Math.max(0, Math.floor((y0 / 1000 - pad) * height));
  const right = Math.min(width, Math.ceil((x1 / 1000 + pad) * width));
  const bottom = Math.min(height, Math.ceil((y1 / 1000 + pad) * height));
  const w = right - left;
  const h = bottom - top;
  if (w < 40 || h < 40) return null; // demasiado pequeño para ser útil
  return sharp(image)
    .extract({ left, top, width: w, height: h })
    .resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}
