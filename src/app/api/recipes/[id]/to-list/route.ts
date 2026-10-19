import { NextResponse } from "next/server";
import { fail, parseId, unauthorized } from "@/lib/api";
import { isAuthorized } from "@/lib/auth";
import { formatQty } from "@/lib/kitchen";
import { sameIngredient } from "@/lib/match";
import { availability } from "@/lib/recipes";
import { db } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

// Añade a la lista de la compra los ingredientes que faltan en la despensa (sin repetir lo que ya está en la lista).
export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAuthorized(req))) return unauthorized();
  const id = parseId((await params).id);
  if (!id) return fail("Id inválido");
  const sb = db();

  const { data: recipe } = await sb.from("recipes").select("id,title").eq("id", id).maybeSingle();
  if (!recipe) return fail("Receta no encontrada", 404);
  const { data: ings } = await sb.from("recipe_ingredients").select("id,position,name,quantity,unit").eq("recipe_id", id).order("position");
  const { data: pantry } = await sb.from("pantry_items").select("name");
  const { data: list } = await sb.from("shopping_items").select("name").eq("checked", false);

  const av = availability({ ingredients: (ings ?? []) as never }, (pantry ?? []).map((p) => p.name));
  const onList = (list ?? []).map((l) => l.name as string);
  const toAdd = (ings ?? [])
    .filter((i) => av.missing.includes(i.name))
    .filter((i) => !onList.some((n) => sameIngredient(i.name, n)));

  if (toAdd.length) {
    const { error } = await sb.from("shopping_items").insert(
      toAdd.map((i) => ({
        name: i.name,
        quantity: 1,
        note: [formatQty(i.quantity == null ? null : Number(i.quantity), i.unit), recipe.title].filter(Boolean).join(" · "),
      })),
    );
    if (error) return fail(error.message, 500);
  }
  return NextResponse.json({ added: toAdd.length, alreadyHave: av.have, alreadyOnList: av.missing.length - toAdd.length });
}
