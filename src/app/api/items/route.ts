import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { productSchema, toRow } from "@/lib/product";
import { db } from "@/lib/supabase";

// Crear un producto a mano.
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = productSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  const sb = db();
  const { data, error } = await sb
    .from("items")
    .insert({ ...toRow(parsed.data), source: "manual", status: "active", locked: true })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await sb.from("price_history").insert({ item_id: data.id, price: parsed.data.price });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
