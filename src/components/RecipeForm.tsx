"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { UNIT_LABEL, UNITS, type Recipe } from "@/lib/kitchen";
import Modal from "./Modal";

type Ing = { name: string; quantity: string; unit: string };
const emptyIng = (): Ing => ({ name: "", quantity: "", unit: "" });

export default function RecipeForm({ recipe, onClose }: { recipe?: Recipe; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(recipe?.title ?? "");
  const [servings, setServings] = useState(recipe?.servings != null ? String(recipe.servings) : "");
  const [sourceUrl, setSourceUrl] = useState(recipe?.source_url ?? "");
  const [steps, setSteps] = useState(recipe?.steps ?? "");
  const [notes, setNotes] = useState(recipe?.notes ?? "");
  const [ings, setIngs] = useState<Ing[]>(
    recipe?.ingredients.length ? recipe.ingredients.map((i) => ({ name: i.name, quantity: i.quantity != null ? String(i.quantity) : "", unit: i.unit ?? "" })) : [emptyIng(), emptyIng(), emptyIng()],
  );
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const setIng = (i: number, patch: Partial<Ing>) => setIngs((cur) => cur.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function importText() {
    setReading(true);
    setError("");
    setInfo("");
    try {
      const r = await api<{ title: string; servings: number | null; steps: string; ingredients: { name: string; quantity: number | null; unit: string }[] }>(
        "/api/recipes/import", { method: "POST", json: { text: pasted } });
      setTitle(r.title);
      setServings(r.servings != null ? String(r.servings) : "");
      setSteps(r.steps);
      setIngs(r.ingredients.length ? r.ingredients.map((i) => ({ name: i.name, quantity: i.quantity != null ? String(i.quantity) : "", unit: i.unit })) : [emptyIng()]);
      setInfo(`Receta leída: ${r.ingredients.length} ingredientes. Revísala antes de guardar.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setReading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const ingredients = ings.filter((i) => i.name.trim()).map((i) => ({
      name: i.name, quantity: i.quantity === "" ? null : Number(i.quantity.replace(",", ".")), unit: i.unit || null,
    }));
    if (ingredients.some((i) => i.quantity != null && !Number.isFinite(i.quantity))) return setError("Revisa las cantidades: deben ser números.");
    setBusy(true);
    try {
      const json = { title, servings: servings === "" ? null : Number(servings), source_url: sourceUrl || null, steps: steps || null, notes: notes || null, ingredients };
      if (recipe) {
        await api(`/api/recipes/${recipe.id}`, { method: "PATCH", json });
        router.refresh();
        onClose();
      } else {
        const r = await api<{ id: number }>("/api/recipes", { method: "POST", json });
        router.push(`/recipes/${r.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Modal title={recipe ? "Editar receta" : "Nueva receta"} onClose={onClose} busy={busy || reading}>
      {!recipe && (
        <details style={{ marginBottom: 12 }} open={false}>
          <summary>Pegar el texto de una receta y que la IA la lea</summary>
          <label className="field">
            <span>Texto de la receta <small>(ingredientes y pasos, copiados de donde la tengas)</small></span>
            <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Pega aquí la receta completa…" />
          </label>
          <button type="button" className="btn small" style={{ marginTop: 8 }} onClick={importText} disabled={reading || pasted.trim().length < 20}>
            {reading ? "Leyendo…" : "Leer con IA"}
          </button>
          <p className="muted" style={{ marginTop: 6 }}>Usa 1 petición de tu cuota de IA. No se guarda nada hasta que pulses «Guardar».</p>
        </details>
      )}

      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field full"><span>Título <small>(texto)</small></span>
            <input required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pasta con tomate" /></label>
          <label className="field"><span>Raciones <small>(entero)</small></span>
            <input type="number" inputMode="numeric" min={1} max={100} step={1} value={servings} onChange={(e) => setServings(e.target.value)} placeholder="4" /></label>
          <label className="field"><span>Enlace original <small>(opcional)</small></span>
            <input type="url" maxLength={500} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" /></label>
        </div>

        <h2 style={{ margin: "16px 0 8px", fontSize: "1rem" }}>Ingredientes</h2>
        <div className="rows">
          {ings.map((ing, i) => (
            <div className="ing" key={i}>
              <input aria-label={`Ingrediente ${i + 1}`} placeholder="Ingrediente" maxLength={120} value={ing.name} onChange={(e) => setIng(i, { name: e.target.value })} />
              <input aria-label="Cantidad" type="number" inputMode="decimal" min={0} step="any" placeholder="Cant." value={ing.quantity} onChange={(e) => setIng(i, { quantity: e.target.value })} />
              <select aria-label="Unidad" value={ing.unit} onChange={(e) => setIng(i, { unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{UNIT_LABEL[u]}</option>)}
              </select>
              <button type="button" className="btn" aria-label="Quitar ingrediente" onClick={() => setIngs((c) => (c.length > 1 ? c.filter((_, k) => k !== i) : c))}>×</button>
            </div>
          ))}
        </div>
        <button type="button" className="btn small" style={{ marginTop: 8 }} onClick={() => setIngs((c) => [...c, emptyIng()])}>+ Añadir ingrediente</button>

        <div className="form-grid" style={{ marginTop: 14 }}>
          <label className="field full"><span>Pasos <small>(texto)</small></span>
            <textarea rows={6} maxLength={20000} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder={"1. Hierve la pasta.\n2. …"} /></label>
          <label className="field full"><span>Notas <small>(opcional)</small></span>
            <input maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </div>

        {info && <p className="ok" style={{ marginTop: 10 }}>{info}</p>}
        {error && <p className="err" role="alert" style={{ marginTop: 10 }}>{error}</p>}
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn primary" disabled={busy || reading}>{busy ? "Guardando…" : "Guardar receta"}</button>
        </div>
      </form>
    </Modal>
  );
}
