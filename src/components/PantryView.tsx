"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import { UNIT_LABEL, UNITS, formatQty } from "@/lib/kitchen";
import Modal from "./Modal";

export type PantryRow = { id: number; name: string; quantity: number | null; unit: string | null; expires_on: string | null; notes: string | null };

const daysLeft = (iso: string) => Math.round((new Date(iso + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);

function Expiry({ date }: { date: string | null }) {
  if (!date) return null;
  const d = daysLeft(date);
  if (d < 0) return <span className="tag bad">Caducado hace {-d} {d === -1 ? "día" : "días"}</span>;
  if (d <= 3) return <span className="tag draft">{d === 0 ? "Caduca hoy" : `Caduca en ${d} ${d === 1 ? "día" : "días"}`}</span>;
  return <span className="tag">Caduca {date}</span>;
}

function Form({ item, onDone, onCancel }: { item?: PantryRow; onDone: () => void; onCancel?: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [quantity, setQuantity] = useState(item?.quantity != null ? String(item.quantity) : "");
  const [unit, setUnit] = useState(item?.unit ?? "");
  const [expires, setExpires] = useState(item?.expires_on ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const json = { name, quantity: quantity === "" ? null : Number(quantity.replace(",", ".")), unit: unit || null, expires_on: expires || null };
      if (item) await api(`/api/pantry/${item.id}`, { method: "PATCH", json });
      else await api("/api/pantry", { method: "POST", json });
      if (!item) { setName(""); setQuantity(""); setUnit(""); setExpires(""); }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <label className="field full"><span>Producto <small>(texto)</small></span>
          <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Arroz, leche, huevos…" /></label>
        <label className="field"><span>Cantidad <small>(número)</small></span>
          <input type="number" inputMode="decimal" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="1" /></label>
        <label className="field"><span>Unidad</span>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u === "" ? "Sin unidad" : UNIT_LABEL[u]}</option>)}
          </select></label>
        <label className="field full"><span>Caduca <small>(fecha, opcional)</small></span>
          <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
      </div>
      {error && <p className="err" role="alert" style={{ marginTop: 8 }}>{error}</p>}
      <div className="modal-foot" style={{ justifyContent: "flex-start" }}>
        <button className="btn primary" disabled={busy}>{busy ? "Guardando…" : item ? "Guardar cambios" : "Añadir a la despensa"}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancelar</button>}
      </div>
    </form>
  );
}

export default function PantryView({ items }: { items: PantryRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<PantryRow | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  async function remove(it: PantryRow) {
    if (!confirm(`¿Quitar «${it.name}» de la despensa?`)) return;
    try { await api(`/api/pantry/${it.id}`, { method: "DELETE" }); router.refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }

  const shown = items.filter((i) => i.name.toLowerCase().includes(filter.toLowerCase()));
  const soon = items.filter((i) => i.expires_on && daysLeft(i.expires_on) <= 3).length;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Despensa</h1>
          <p className="muted">{items.length} {items.length === 1 ? "producto" : "productos"} en casa{soon > 0 && <> · <b>{soon}</b> por caducar o caducados</>}</p>
        </div>
      </div>

      <section className="card">
        <div className="card-head"><h2>Añadir a la despensa</h2></div>
        <Form onDone={() => router.refresh()} />
      </section>

      {error && <p className="err" role="alert">{error}</p>}

      {items.length > 6 && (
        <input aria-label="Filtrar despensa" placeholder="Filtrar…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}

      {items.length === 0 ? (
        <div className="card empty">Tu despensa está vacía. Añade lo que tienes para saber qué recetas puedes cocinar.</div>
      ) : (
        <div className="rows">
          {shown.map((it) => (
            <div className="rowitem" key={it.id}>
              <div className="grow-text">
                <b>{it.name}</b>
                <span className="muted">{formatQty(it.quantity, it.unit) || "—"}</span>
              </div>
              <Expiry date={it.expires_on} />
              <button className="btn small" onClick={() => setEditing(it)}>Editar</button>
              <button className="btn danger small" onClick={() => remove(it)} aria-label={`Quitar ${it.name}`}>Quitar</button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <Modal title="Editar producto" onClose={() => setEditing(null)}>
          <Form item={editing} onDone={() => { setEditing(null); router.refresh(); }} onCancel={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
