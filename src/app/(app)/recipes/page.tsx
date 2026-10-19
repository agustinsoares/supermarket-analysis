import RecipesView, { type RecipeCard } from "@/components/RecipesView";
import { availability } from "@/lib/recipes";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  try {
    const sb = db();
    const { data: recipes, error } = await sb.from("recipes").select("id,title,servings").order("created_at", { ascending: false });
    if (error) throw error;
    const { data: ings } = await sb.from("recipe_ingredients").select("recipe_id,position,name,quantity,unit,id").order("position");
    const { data: pantry } = await sb.from("pantry_items").select("name");
    const names = (pantry ?? []).map((p) => p.name as string);

    const cards: RecipeCard[] = (recipes ?? []).map((r) => {
      const mine = (ings ?? []).filter((i) => i.recipe_id === r.id);
      const av = availability({ ingredients: mine as never }, names);
      return { id: r.id, title: r.title, servings: r.servings, total: av.total, have: av.have, missing: av.missing };
    });
    return <RecipesView recipes={cards} pantryCount={names.length} />;
  } catch (e) {
    return <div className="card err">No se pudo leer la base de datos: {(e as { message?: string })?.message ?? String(e)}</div>;
  }
}
