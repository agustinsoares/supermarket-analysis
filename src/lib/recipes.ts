import { sameIngredient } from "./match";
import type { Recipe } from "./kitchen";

export type Availability = { have: number; total: number; missing: string[]; haveNames: Set<string> };

/** Qué ingredientes de la receta están en la despensa (solo presencia, no cantidades). */
export function availability(recipe: Pick<Recipe, "ingredients">, pantryNames: string[]): Availability {
  const missing: string[] = [];
  const haveNames = new Set<string>();
  for (const ing of recipe.ingredients) {
    if (pantryNames.some((p) => sameIngredient(ing.name, p))) haveNames.add(ing.name);
    else missing.push(ing.name);
  }
  return { have: haveNames.size, total: recipe.ingredients.length, missing, haveNames };
}
