import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { createSignedUpload } from "@/lib/storage";

// POST { bucket: "product-images" | "flyers", contentType } -> { path, signedUrl, publicUrl }
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { bucket, contentType } = (await req.json().catch(() => ({}))) as { bucket?: string; contentType?: string };
  if (!bucket || !contentType) return NextResponse.json({ error: "Faltan bucket o contentType" }, { status: 400 });
  try {
    return NextResponse.json(await createSignedUpload(bucket, contentType));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
