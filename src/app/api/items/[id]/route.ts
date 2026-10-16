import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { pricePerKg, productSchema, toRow } from "@/lib/product";
import { db } from "@/lib/supabase";
import { IMAGE_BUCKET, pathFromPublicUrl, removeFromBucket } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Editar un producto. Los de Kassalapp quedan "bloqueados" para que la sincronización no pise la edición.
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const parsed = productSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }

  const sb = db();
  const { data: prev, error: e0 } = await sb.from("items").select("current_price,image").eq("id", id).maybeSingle();
  if (e0) return NextResponse.json({ error: e0.message }, { status: 500 });
  if (!prev) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

  const row = toRow(parsed.data);
  // Si el precio no cambia, no tocamos la fecha de precio.
  const priceChanged = Number(prev.current_price) !== parsed.data.price;
  const update: Record<string, unknown> = { ...row, current_unit_price: pricePerKg(parsed.data.price, parsed.data.grams), locked: true };
  if (!priceChanged) delete update.price_updated_at;

  const { error } = await sb.from("items").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (priceChanged) await sb.from("price_history").insert({ item_id: id, price: parsed.data.price });

  // Si cambió la imagen, borra la anterior del almacenamiento.
  const oldPath = pathFromPublicUrl(prev.image);
  if (oldPath && prev.image !== (parsed.data.image ?? null)) await removeFromBucket(IMAGE_BUCKET, [oldPath]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  const sb = db();
  const { data: prev } = await sb.from("items").select("image").eq("id", id).maybeSingle();
  const { error } = await sb.from("items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const path = pathFromPublicUrl(prev?.image ?? null);
  if (path) await removeFromBucket(IMAGE_BUCKET, [path]);
  return NextResponse.json({ ok: true });
}
