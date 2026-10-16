import { randomUUID } from "node:crypto";
import { db } from "./supabase";

export const IMAGE_BUCKET = "product-images";
export const FLYER_BUCKET = "flyers";

export const ALLOWED: Record<string, { mimes: string[]; maxBytes: number }> = {
  [IMAGE_BUCKET]: { mimes: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * 1024 * 1024 },
  [FLYER_BUCKET]: { mimes: ["image/jpeg", "image/png", "image/webp", "application/pdf"], maxBytes: 50 * 1024 * 1024 },
};

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** Crea una URL firmada para que el navegador suba el archivo directo a Supabase Storage. */
export async function createSignedUpload(bucket: string, contentType: string) {
  const rule = ALLOWED[bucket];
  if (!rule) throw new Error("Bucket no permitido");
  if (!rule.mimes.includes(contentType)) throw new Error(`Tipo de archivo no permitido: ${contentType}`);

  const day = new Date().toISOString().slice(0, 10);
  const path = `${day}/${randomUUID()}.${EXT[contentType]}`;
  const { data, error } = await db().storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear la URL de subida");

  const publicUrl = bucket === IMAGE_BUCKET ? db().storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
  return { path, signedUrl: data.signedUrl, publicUrl };
}

export async function downloadFromBucket(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await db().storage.from(bucket).download(path);
  if (error || !data) throw new Error(`No se pudo leer ${path}: ${error?.message ?? "vacío"}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function removeFromBucket(bucket: string, paths: string[]) {
  if (paths.length) await db().storage.from(bucket).remove(paths);
}

/** Ruta de objeto a partir de la URL pública de una imagen (para borrarla). */
export function pathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/object/public/${IMAGE_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}
