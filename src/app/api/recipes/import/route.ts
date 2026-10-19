import { NextResponse } from "next/server";
import { fail, readJson, unauthorized } from "@/lib/api";
import { isAuthorized } from "@/lib/auth";
import { UNITS } from "@/lib/kitchen";
import { activeProvider, extractRecipe, NO_KEY_MESSAGE } from "@/lib/llm";

export const maxDuration = 60;

// POST { text } -> receta estructurada para revisar en el formulario (no se guarda nada).
export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return unauthorized();
  const body = (await readJson(req)) as { text?: string } | null;
  const text = body?.text?.trim() ?? "";
  if (text.length < 20) return fail("Pega el texto de la receta (al menos unas líneas).");
  if (text.length > 20000) return fail("El texto es demasiado largo (máx. 20.000 caracteres).");
  if (!activeProvider()) return fail(NO_KEY_MESSAGE, 500);
  try {
    const r = await extractRecipe(text);
    return NextResponse.json({
      title: r.title.trim(),
      servings: r.servings > 0 ? Math.round(r.servings) : null,
      steps: r.steps.trim(),
      ingredients: r.ingredients
        .filter((i) => i.name.trim())
        .map((i) => ({
          name: i.name.trim(),
          quantity: i.quantity > 0 ? i.quantity : null,
          unit: (UNITS as readonly string[]).includes(i.unit) ? i.unit : "",
        })),
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e), 502);
  }
}
