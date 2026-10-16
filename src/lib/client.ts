// Utilidades que solo se usan en el navegador.

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Error ${res.status}`);
  return body as T;
}

/** Reduce una imagen en el navegador antes de subirla (ahorra datos y espacio). */
export async function resizeImage(file: File, maxSide: number, type: "image/webp" | "image/jpeg", quality: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.fillStyle = "#fff"; // fondo blanco para PNG con transparencia
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
  if (!blob) throw new Error("No se pudo comprimir la imagen");
  return blob;
}

/** Sube un archivo directo a Supabase Storage con una URL firmada. */
export async function uploadToBucket(bucket: "product-images" | "flyers", blob: Blob) {
  const signed = await api<{ path: string; signedUrl: string; publicUrl: string | null }>("/api/uploads/sign", {
    method: "POST",
    json: { bucket, contentType: blob.type },
  });
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", blob); // formato que espera Supabase Storage
  const res = await fetch(signed.signedUrl, { method: "PUT", body });
  if (!res.ok) throw new Error(`No se pudo subir el archivo (${res.status})`);
  return { path: signed.path, publicUrl: signed.publicUrl };
}

export const nok = (n: number) => `${n.toFixed(2).replace(".", ",")} kr`;
