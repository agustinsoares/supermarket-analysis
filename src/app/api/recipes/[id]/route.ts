import { NextResponse } from "next/server";
import { fail, parseId, readJson, unauthorized } from "@/lib/api";
import { isAuthorized } from "@/lib/auth";
import { errMsg, recipeSchema } from "@/lib/kitchen";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

// Edita la receta y sustituye sus ingredientes (primero inserta los nuevos, luego borra los viejos: nada se pierde si falla).
export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return fail("Id inválido");
  const p = recipeSchema.safeParse(await readJson(req));
  if (!p.success) return fail(errMsg(p.error));
  const { ingredients, ...recipe } = p.data;
  const sb = db();

  const { data: old, error: e0 } = await sb.from("recipe_ingredients").select("id").eq("recipe_id", id);
  if (e0) return fail(e0.message, 500);
  const { error: e1 } = await sb.from("recipes").update({ ...recipe, updated_at: new Date().toISOString() }).eq("id", id);
  if (e1) return fail(e1.message, 500);
  const { error: e2 } = await sb.from("recipe_ingredients").insert(
    ingredients.map((i, position) => ({ recipe_id: id, position, name: i.name, quantity: i.quantity ?? null, unit: i.unit ?? null })),
  );
  if (e2) return fail(e2.message, 500);
  const oldIds = (old ?? []).map((r) => r.id as number);
  if (oldIds.length) await sb.from("recipe_ingredients").delete().in("id", oldIds);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return fail("Id inválido");
  const { error } = await db().from("recipes").delete().eq("id", id); // los ingredientes se borran en cascada
  return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
}
