"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, nok } from "@/lib/client";
import { CHAIN_BY_CODE } from "@/lib/config";
import type { ShoppingPlan } from "@/lib/pricing";
import ChainBadge from "./ChainBadge";
import Modal from "./Modal";
import ProductSuggest from "./ProductSuggest";

const label = (c: string) => CHAIN_BY_CODE.get(c as never)?.label ?? c;

export default function ShoppingView({ plan }: { plan: ShoppingPlan }) {
  const router = useRouter();
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [linking, setLinking] = useState<{ id: number; name: string } | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try { await fn(); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  const q = () => Math.max(1, Number(qty.replace(",", ".")) || 1);
  const add = (json: { name: string; item_ref?: number }) => run(() => api("/api/shopping", { method: "POST", json: { ...json, quantity: q() } }));
  const patch = (id: number, json: object) => run(() => api(`/api/shopping/${id}`, { method: "PATCH", json }));
  const remove = (id: number) => run(() => api(`/api/shopping/${id}`, { method: "DELETE" }));
  const clearChecked = () => run(() => api("/api/shopping?checked=1", { method: "DELETE" }));

  const open = plan.lines.filter((l) => !l.checked);
  const done = plan.lines.filter((l) => l.checked);
  const linkedCount = open.filter((l) => l.item_ref != null).length;
  const bestTotal = plan.bestSingle?.total ?? null;
  const saving = plan.mixed && bestTotal != null ? Math.round((bestTotal - plan.mixed.total) * 100) / 100 : null;

  const row = (l: (typeof plan.lines)[number]) => (
    <div key={l.id} className={`rowitem${l.checked ? " done" : ""}`}>
      <input type="checkbox" checked={l.checked} onChange={(e) => patch(l.id, { checked: e.target.checked })} aria-label={`Marcar ${l.name}`} disabled={busy} />
      <div className="grow-text">
        <b>{l.name}</b>
        {l.note && <span className="muted">{l.note}</span>}
        {l.options.length > 1 && (
          <span className="muted">{l.options.map((o) => `${CHAIN_BY_CODE.get(o.chain as never)?.short ?? o.chain} ${nok(o.price)}`).join(" · ")}</span>
        )}
      </div>
      <div className="qty" aria-label="Cantidad">
        <button type="button" onClick={() => l.quantity > 1 && patch(l.id, { quantity: l.quantity - 1 })} aria-label="Menos" disabled={busy}>−</button>
        <span>{l.quantity}</span>
        <button type="button" onClick={() => patch(l.id, { quantity: l.quantity + 1 })} aria-label="Más" disabled={busy}>+</button>
      </div>
      <div className="price-tag" style={{ minWidth: 84 }}>
        {l.best ? (<>{nok(l.best.price * l.quantity)}<small><ChainBadge code={l.best.chain} /></small></>)
          : l.item_ref != null ? <small>Sin precio vigente</small>
          : l.checked ? null
          : <button type="button" className="btn small" onClick={() => setLinking({ id: l.id, name: l.name })}>Vincular</button>}
      </div>
      <button className="btn danger small" onClick={() => remove(l.id)} aria-label={`Quitar ${l.name}`} disabled={busy}>×</button>
    </div>
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Lista de la compra</h1>
          <p className="muted">{open.length} por comprar{done.length > 0 && <> · {done.length} marcados</>}</p>
        </div>
        {done.length > 0 && <button className="btn small" onClick={clearChecked} disabled={busy}>Quitar marcados</button>}
      </div>

      <section className="card">
        <div className="card-head"><h2>Añadir</h2></div>
        <div className="row">
          <ProductSuggest label="Producto" placeholder="Busca un producto (lettmelk, egg…) o escribe y pulsa Enter"
            onPick={(s) => add({ name: [s.name, s.brand].filter(Boolean).join(" · "), item_ref: s.itemId })}
            onText={(text) => add({ name: text })} />
          <input type="number" inputMode="decimal" min={1} step="1" aria-label="Cantidad" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 90, flex: "none" }} />
        </div>
        <p className="muted" style={{ marginTop: 8 }}>Elige un producto del catálogo para ver su precio en cada tienda. Lo que escribas a mano se queda sin precio.</p>
      </section>

      {error && <p className="err" role="alert">{error}</p>}

      {plan.lines.length === 0 ? (
        <div className="card empty">La lista está vacía. Añade productos arriba o desde una receta.</div>
      ) : (
        <>
          <div className="rows">{open.map(row)}</div>
          {done.length > 0 && <><h2 style={{ marginTop: 8 }}>Marcados</h2><div className="rows">{done.map(row)}</div></>}
        </>
      )}

      {linkedCount > 0 && (
        <section className="card plan" aria-labelledby="plan-h">
          <div className="card-head"><h2 id="plan-h">¿Dónde me conviene comprar?</h2></div>

          <div>
            {plan.totals.filter((t) => t.of > 0 && t.covered > 0).sort((a, b) => (a.covered === a.of ? 0 : 1) - (b.covered === b.of ? 0 : 1) || a.total - b.total).map((t) => {
              const full = t.covered === t.of;
              return (
                <div key={t.chain} className={`plan-row${plan.bestSingle?.chain === t.chain ? " best" : ""}`}>
                  <span><ChainBadge code={t.chain} full />{!full && <span className="muted"> · faltan {t.of - t.covered} de {t.of}</span>}</span>
                  <b>{t.covered ? nok(t.total) : "—"}{!full && t.covered > 0 ? "*" : ""}</b>
                </div>
              );
            })}
            {plan.totals.some((t) => t.of > 0 && t.covered > 0 && t.covered < t.of) && (
              <p className="muted" style={{ marginTop: 6 }}>* Total parcial: solo cuenta los productos con precio en esa tienda.</p>
            )}
          </div>

          {plan.bestSingle ? (
            <p style={{ margin: 0 }}>Todo en una sola tienda: <b>{label(plan.bestSingle.chain)}</b> por <b>{nok(plan.bestSingle.total)}</b>.</p>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Ninguna tienda tiene precio de todos los productos enlazados.</p>
          )}

          {plan.mixed && plan.mixed.byChain.length > 1 && (
            <div>
              <p style={{ margin: "0 0 6px" }}>
                Repartiendo (cada cosa donde es más barata): <b>{nok(plan.mixed.total)}</b>
                {saving != null && saving > 0.005 && <> — ahorras <b>{nok(saving)}</b></>}
              </p>
              {plan.mixed.byChain.map((g) => (
                <details key={g.chain} style={{ marginBottom: 4 }}>
                  <summary><ChainBadge code={g.chain} full /> · {nok(g.total)} · {g.lines.length} {g.lines.length === 1 ? "producto" : "productos"}</summary>
                  <ul style={{ margin: "4px 0 8px", paddingLeft: 20 }}>{g.lines.map((x) => <li key={x.id}>{x.name} — {nok(x.price)}</li>)}</ul>
                </details>
              ))}
            </div>
          )}
          {plan.unlinked > 0 && <p className="muted" style={{ margin: 0 }}>{plan.unlinked} {plan.unlinked === 1 ? "producto sin precio no entra" : "productos sin precio no entran"} en el cálculo.</p>}
        </section>
      )}

      {linking && (
        <Modal title={`Vincular «${linking.name}»`} onClose={() => setLinking(null)}>
          <p className="muted">Busca el producto del catálogo para ver su precio en cada tienda.</p>
          <div style={{ minHeight: 120 }}>
            <ProductSuggest label="Buscar producto" placeholder="Buscar en el catálogo…" onPick={(s) => { const id = linking.id; setLinking(null); patch(id, { item_ref: s.itemId }); }} />
          </div>
          <div className="modal-foot"><button className="btn" onClick={() => setLinking(null)}>Cancelar</button></div>
        </Modal>
      )}
    </div>
  );
}
