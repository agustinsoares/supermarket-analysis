import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { FLYER_BUCKET, removeFromBucket } from "@/lib/storage";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

// Borra el folleto, sus archivos y los productos que aún están en borrador. Los aprobados se conservan.
export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const sb = db();
  const { data: flyer } = await sb.from("flyers").select("files").eq("id", id).maybeSingle();
  if (!flyer) return NextResponse.json({ error: "Folleto no encontrado" }, { status: 404 });

  await sb.from("items").delete().eq("flyer_id", id).eq("status", "draft");
  const { error } = await sb.from("flyers").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await removeFromBucket(FLYER_BUCKET, (flyer.files as { path: string }[]).map((f) => f.path));
  return NextResponse.json({ ok: true });
}
