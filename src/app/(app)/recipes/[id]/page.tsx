import Link from "next/link";
import { notFound } from "next/navigation";
import RecipeActions from "@/components/RecipeActions";
import { formatQty, type Recipe } from "@/lib/kitchen";
import { availability } from "@/lib/recipes";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const sb = db();
  const { data: r } = await sb.from("recipes").select("id,title,servings,source_url,steps,notes").eq("id", id).maybeSingle();
  if (!r) notFound();
  const { data: ings } = await sb.from("recipe_ingredients").select("id,position,name,quantity,unit").eq("recipe_id", id).order("position");
  const { data: pantry } = await sb.from("pantry_items").select("name");

  const recipe: Recipe = { ...r, ingredients: (ings ?? []).map((i) => ({ ...i, quantity: i.quantity == null ? null : Number(i.quantity) })) };
  const av = availability(recipe, (pantry ?? []).map((p) => p.name as string));

  return (
    <div className="stack">
      <p style={{ margin: 0 }}><Link href="/recipes" className="muted">← Recetas</Link></p>
      <div className="page-head">
        <div>
          <h1>{recipe.title}</h1>
          <p className="muted">
            {recipe.servings ? `${recipe.servings} raciones · ` : ""}
            {av.have === av.total ? <span className="ok">✓ Tienes todos los ingredientes</span> : <>Tienes {av.have} de {av.total} ingredientes</>}
            {recipe.source_url && <> · <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>Receta original</a></>}
          </p>
        </div>
      </div>

      <RecipeActions recipe={recipe} missing={av.missing.length} />

      <section className="card">
        <div className="card-head"><h2>Ingredientes</h2></div>
        <ul className="ings">
          {recipe.ingredients.map((i) => {
            const have = av.haveNames.has(i.name);
            return (
              <li key={i.id}>
                <span className={have ? "have" : "miss"} aria-label={have ? "En la despensa" : "Falta"}>{have ? "✓" : "✗"}</span>
                <span>{[formatQty(i.quantity, i.unit), i.name].filter(Boolean).join(" ")}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {recipe.steps && (
        <section className="card">
          <div className="card-head"><h2>Preparación</h2></div>
          <div className="steps">{recipe.steps}</div>
        </section>
      )}
      {recipe.notes && <p className="muted">Notas: {recipe.notes}</p>}
    </div>
  );
}
