"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, nok } from "@/lib/client";
import { SOURCE_LABEL } from "@/lib/config";
import type { ItemRow } from "@/lib/product";
import ChainBadge from "./ChainBadge";
import ProductForm from "./ProductForm";

export default function ProductsView({ items, draftFlyerId, isDraftView }: { items: ItemRow[]; draftFlyerId: number | null; isDraftView: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ItemRow | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const remove = (it: ItemRow) => confirm(`¿Borrar «${it.name}»?`) && run(() => api(`/api/items/${it.id}`, { method: "DELETE" }));
  const bulk = (action: "approve" | "discard", ids?: number[]) =>
    run(() => api("/api/items/bulk", { method: "POST", json: { action, ...(ids ? { ids } : { flyerId: draftFlyerId }) } }));

  const draftIds = items.filter((i) => i.status === "draft").map((i) => i.id);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{isDraftView ? "Revisar productos" : "Productos"}</h1>
          <p className="muted">{items.length} {items.length === 1 ? "producto" : "productos"}</p>
        </div>
        <button className="btn primary" onClick={() => setEditing("new")}>+ Añadir producto</button>
      </div>

      {error && <p className="err" role="alert">{error}</p>}

      {isDraftView && items.length > 0 && (
        <div className="banner" style={{ marginBottom: 16 }}>
          <span>Leídos por la IA desde folletos. Revisa y edita lo que haga falta antes de aprobar.</span>
          <span className="row">
            <button className="btn primary small" disabled={busy} onClick={() => bulk("approve", draftIds)}>Aprobar {draftIds.length}</button>
            <button className="btn danger small" disabled={busy}
              onClick={() => confirm(`¿Descartar ${draftIds.length} productos?`) && bulk("discard", draftIds)}>Descartar todos</button>
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <div className="card empty">
          {isDraftView ? "No hay productos pendientes de revisar." : "No hay productos con estos filtros."}
        </div>
      ) : (
        <div className="grid">
          {items.map((it) => (
            <article key={it.id} className={`prod${it.status === "draft" ? " is-draft" : ""}`}>
              <div className="prod-img">
                {it.image ? <img src={it.image} alt="" loading="lazy" /> : <span aria-hidden>{it.name.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div className="prod-body">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <ChainBadge code={it.chain} />
                  <span className={`tag${it.status === "draft" ? " draft" : ""}`}>{it.status === "draft" ? "Borrador" : SOURCE_LABEL[it.source]}</span>
                </div>
                <div className="prod-name">{it.name}</div>
                <div className="muted">{[it.brand, it.grams ? `${it.grams} g` : null].filter(Boolean).join(" · ") || "—"}</div>
                <div className="prod-price">
                  {it.current_price != null ? nok(Number(it.current_price)) : "—"}
                  {it.current_unit_price ? <small> · {nok(Number(it.current_unit_price))}/kg</small> : null}
                </div>
                <div className="prod-meta">
                  {it.category && <span className="tag">{it.category}</span>}
                  {(it.valid_from || it.valid_to) && <span className="tag">{it.valid_from ?? "…"} → {it.valid_to ?? "…"}</span>}
                  {it.notes && <span className="tag">{it.notes}</span>}
                </div>
              </div>
              <div className="prod-actions">
                {it.status === "draft" && <button className="btn primary small" disabled={busy} onClick={() => bulk("approve", [it.id])}>Aprobar</button>}
                <button className="btn small" disabled={busy} onClick={() => setEditing(it)}>Editar</button>
                <button className="btn danger small" disabled={busy} onClick={() => remove(it)}>Borrar</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && <ProductForm item={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </>
  );
}
