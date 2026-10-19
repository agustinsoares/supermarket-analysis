import { NextResponse } from "next/server";
import { fail, readJson, unauthorized } from "@/lib/api";
import { isAuthorized } from "@/lib/auth";
import { errMsg, recipeSchema } from "@/lib/kitchen";
import { db } from "@/lib/supabase";

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return unauthorized();
  const p = recipeSchema.safeParse(await readJson(req));
  if (!p.success) return fail(errMsg(p.error));
  const { ingredients, ...recipe } = p.data;
  const sb = db();
  const { data, error } = await sb.from("recipes").insert(recipe).select("id").single();
  if (error) return fail(error.message, 500);
  const { error: e2 } = await sb.from("recipe_ingredients").insert(
    ingredients.map((i, position) => ({ recipe_id: data.id, position, name: i.name, quantity: i.quantity ?? null, unit: i.unit ?? null })),
  );
  if (e2) {
    await sb.from("recipes").delete().eq("id", data.id); // no dejar una receta sin ingredientes
    return fail(e2.message, 500);
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
