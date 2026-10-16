import { NextResponse } from "next/server";
import { z } from "zod";
import { isAuthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";

const bodySchema = z.object({
  action: z.enum(["approve", "discard"]),
  ids: z.array(z.number().int().positive()).max(1000).optional(),
  flyerId: z.number().int().positive().optional(),
});

// Aprobar o descartar productos en borrador (por ids o por folleto).
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.ids?.length && !parsed.data.flyerId)) {
    return NextResponse.json({ error: "Indica 'ids' o 'flyerId'" }, { status: 400 });
  }
  const { action, ids, flyerId } = parsed.data;
  const sb = db();

  let q = action === "approve"
    ? sb.from("items").update({ status: "active", locked: true, updated_at: new Date().toISOString() })
    : sb.from("items").delete();
  q = q.eq("status", "draft"); // nunca toca productos ya activos
  q = ids?.length ? q.in("id", ids) : q.eq("flyer_id", flyerId as number);

  const { data, error } = await q.select("id,current_price");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (action === "approve" && data?.length) {
    await sb.from("price_history").insert(
      data.filter((r) => r.current_price != null).map((r) => ({ item_id: r.id, price: r.current_price })),
    );
  }

  if (flyerId) {
    // Un folleto sin borradores pendientes pasa a "done".
    const { count } = await sb.from("items").select("id", { count: "exact", head: true }).eq("flyer_id", flyerId).eq("status", "draft");
    if (!count) await sb.from("flyers").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", flyerId).eq("status", "review");
  }
  return NextResponse.json({ count: data?.length ?? 0 });
}
