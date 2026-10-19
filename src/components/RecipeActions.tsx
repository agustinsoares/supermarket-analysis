"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { Recipe } from "@/lib/kitchen";
import RecipeForm from "./RecipeForm";

export default function RecipeActions({ recipe, missing }: { recipe: Recipe; missing: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function toList() {
    setBusy(true); setError(""); setMsg("");
    try {
      const r = await api<{ added: number; alreadyOnList: number }>(`/api/recipes/${recipe.id}/to-list`, { method: "POST" });
      setMsg(r.added ? `Añadidos ${r.added} a la lista de la compra${r.alreadyOnList ? ` (${r.alreadyOnList} ya estaban)` : ""}.` : "No falta nada nuevo: todo está en la despensa o ya en la lista.");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm(`¿Borrar la receta «${recipe.title}»?`)) return;
    setBusy(true);
    try { await api(`/api/recipes/${recipe.id}`, { method: "DELETE" }); router.push("/recipes"); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  }

  return (
    <>
      <div className="row">
        <button className="btn primary" onClick={toList} disabled={busy || missing === 0}>Añadir lo que falta a la lista{missing > 0 ? ` (${missing})` : ""}</button>
        <button className="btn" onClick={() => setEditing(true)} disabled={busy}>Editar</button>
        <button className="btn danger" onClick={remove} disabled={busy}>Borrar</button>
        {msg && <span className="ok">{msg} <Link href="/shopping" style={{ textDecoration: "underline" }}>Ver lista</Link></span>}
        {error && <span className="err">{error}</span>}
      </div>
      {editing && <RecipeForm recipe={recipe} onClose={() => setEditing(false)} />}
    </>
  );
}
