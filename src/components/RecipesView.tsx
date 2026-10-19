"use client";

import Link from "next/link";
import { useState } from "react";
import RecipeForm from "./RecipeForm";

export type RecipeCard = { id: number; title: string; servings: number | null; total: number; have: number; missing: string[] };

export default function RecipesView({ recipes, pantryCount }: { recipes: RecipeCard[]; pantryCount: number }) {
  const [creating, setCreating] = useState(false);
  const [sort, setSort] = useState<"cook" | "recent">("cook");
  const [onlyReady, setOnlyReady] = useState(false);

  const list = [...recipes]
    .filter((r) => !onlyReady || (r.total > 0 && r.have === r.total))
    .sort((a, b) => (sort === "cook" ? b.have / (b.total || 1) - a.have / (a.total || 1) || a.missing.length - b.missing.length : 0));
  const ready = recipes.filter((r) => r.total > 0 && r.have === r.total).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Recetas</h1>
          <p className="muted">{recipes.length} {recipes.length === 1 ? "receta" : "recetas"}{pantryCount > 0 && <> · puedes cocinar <b>{ready}</b> con lo que tienes</>}</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ Nueva receta</button>
      </div>

      {recipes.length > 0 && (
        <div className="row">
          <select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as "cook" | "recent")} style={{ width: "auto" }}>
            <option value="cook">Primero las que más puedo cocinar</option>
            <option value="recent">Más recientes</option>
          </select>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" style={{ width: 18, minHeight: 0 }} checked={onlyReady} onChange={(e) => setOnlyReady(e.target.checked)} /> Solo las que puedo cocinar ya</label>
        </div>
      )}

      {pantryCount === 0 && recipes.length > 0 && (
        <div className="banner"><span>Tu despensa está vacía, así que no puedo decirte qué recetas puedes cocinar.</span><Link className="btn small" href="/pantry">Ir a la despensa</Link></div>
      )}

      {recipes.length === 0 ? (
        <div className="card empty">Todavía no hay recetas. Añade una a mano o pega el texto de una y la IA la lee.</div>
      ) : list.length === 0 ? (
        <div className="card empty">Ninguna receta tiene todos sus ingredientes en la despensa.</div>
      ) : (
        <div className="grid">
          {list.map((r) => {
            const pct = r.total ? Math.round((r.have / r.total) * 100) : 0;
            return (
              <Link key={r.id} href={`/recipes/${r.id}`} className="recipe-card">
                <strong>{r.title}</strong>
                <span className="muted">{r.servings ? `${r.servings} raciones · ` : ""}{r.total} ingredientes</span>
                <div className="meter" role="img" aria-label={`Tienes ${r.have} de ${r.total}`}><i style={{ width: `${pct}%` }} /></div>
                <span className={r.have === r.total ? "ok" : "muted"}>
                  {r.have === r.total ? "✓ Puedes cocinarla" : `Tienes ${r.have} de ${r.total}${r.missing.length ? ` · faltan: ${r.missing.slice(0, 3).join(", ")}${r.missing.length > 3 ? "…" : ""}` : ""}`}
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {creating && <RecipeForm onClose={() => setCreating(false)} />}
    </div>
  );
}
