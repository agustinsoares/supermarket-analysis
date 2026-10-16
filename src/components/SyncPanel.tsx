"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";

type SyncResult = { results: { chain: string; seen: number; changes: number; error?: string }[] };

export default function SyncPanel({ terms }: { terms: string[] }) {
  const router = useRouter();
  const [newTerm, setNewTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");

  async function addTerm(e: React.FormEvent) {
    e.preventDefault();
    if (!newTerm.trim()) return;
    setBusy(true);
    try {
      await api("/api/terms", { method: "POST", json: { term: newTerm } });
      setLog(`Añadido «${newTerm.trim()}». Pulsa «Actualizar precios» para traer sus precios.`);
      setNewTerm("");
      router.refresh();
    } catch (err) {
      setLog(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeTerm(term: string) {
    setBusy(true);
    try {
      await api("/api/terms", { method: "DELETE", json: { term } });
      router.refresh();
    } catch (err) {
      setLog(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    setBusy(true);
    setLog("");
    try {
      for (const term of terms) {
        setLog((l) => `${l}Buscando «${term}»…\n`);
        const r = await api<SyncResult>("/api/sync", { method: "POST", json: { term } });
        const line = r.results
          .map((x) => (x.error ? `${x.chain}: ERROR ${x.error}` : `${x.chain}: ${x.seen} productos, ${x.changes} cambios`))
          .join(" · ");
        setLog((l) => `${l}   ${line}\n`);
      }
      setLog((l) => `${l}Listo.`);
      router.refresh();
    } catch (err) {
      setLog((l) => `${l}${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function syncStores() {
    setBusy(true);
    try {
      const r = await api<{ stores: number }>("/api/sync", { method: "POST", json: { stores: true } });
      setLog(`${r.stores} tiendas cercanas guardadas.`);
    } catch (err) {
      setLog(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="sync-h">
      <div className="card-head">
        <h2 id="sync-h">Productos vigilados</h2>
        <div className="row">
          <button className="btn primary small" disabled={busy || !terms.length} onClick={syncAll}>
            {busy ? "Actualizando…" : "Actualizar precios"}
          </button>
          <button className="btn small" disabled={busy} onClick={syncStores}>Tiendas cercanas</button>
        </div>
      </div>
      <form className="row" onSubmit={addTerm}>
        <input className="grow" aria-label="Producto a vigilar" placeholder="Producto a vigilar (ej: lettmelk, egg, kyllingfilet)"
          value={newTerm} onChange={(e) => setNewTerm(e.target.value)} />
        <button className="btn" disabled={busy || !newTerm.trim()}>Añadir</button>
      </form>
      {terms.length > 0 && (
        <div className="chips">
          {terms.map((t) => (
            <span key={t} className="chip">
              {t}
              <button type="button" aria-label={`Quitar ${t}`} disabled={busy} onClick={() => removeTerm(t)}>×</button>
            </span>
          ))}
        </div>
      )}
      {log && <pre className="log">{log}</pre>}
    </section>
  );
}
