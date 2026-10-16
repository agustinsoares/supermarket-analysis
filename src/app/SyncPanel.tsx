"use client";

import { useEffect, useState } from "react";

const KEY = "sync-secret";

export default function SyncPanel({ terms }: { terms: string[] }) {
  const [secret, setSecret] = useState("");
  const [newTerm, setNewTerm] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");

  useEffect(() => {
    try { setSecret(localStorage.getItem(KEY) ?? ""); } catch {}
  }, []);

  function saveSecret(v: string) {
    setSecret(v);
    try { localStorage.setItem(KEY, v); } catch {}
  }

  async function call(url: string, method: string, body: unknown) {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    return json;
  }

  async function addTerm() {
    if (!newTerm.trim()) return;
    setBusy(true);
    try {
      await call("/api/terms", "POST", { term: newTerm });
      setLog(`Añadido "${newTerm.trim()}". Pulsa "Actualizar precios" para traer sus precios.`);
      setNewTerm("");
      location.reload();
    } catch (e) { setLog(String(e)); } finally { setBusy(false); }
  }

  async function removeTerm(term: string) {
    setBusy(true);
    try { await call("/api/terms", "DELETE", { term }); location.reload(); }
    catch (e) { setLog(String(e)); setBusy(false); }
  }

  async function syncAll() {
    setBusy(true);
    setLog("");
    try {
      for (const term of terms) {
        setLog((l) => `${l}Buscando "${term}"…\n`);
        const r = await call("/api/sync", "POST", { term });
        const line = r.results
          .map((x: { chain: string; seen: number; changes: number; error?: string }) =>
            x.error ? `${x.chain}: ERROR ${x.error}` : `${x.chain}: ${x.seen} productos, ${x.changes} cambios`)
          .join(" | ");
        setLog((l) => `${l}  ${line}\n`);
      }
      setLog((l) => `${l}Listo.`);
      location.reload();
    } catch (e) { setLog((l) => `${l}${String(e)}`); setBusy(false); }
  }

  async function syncStores() {
    setBusy(true);
    try { const r = await call("/api/sync", "POST", { stores: true }); setLog(`${r.stores} tiendas cercanas guardadas.`); }
    catch (e) { setLog(String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="card">
      <div className="row">
        <input type="password" placeholder="Clave (SYNC_SECRET)" value={secret} onChange={(e) => saveSecret(e.target.value)} />
        <button disabled={busy || !secret || !terms.length} onClick={syncAll}>Actualizar precios</button>
        <button className="ghost" disabled={busy || !secret} onClick={syncStores}>Tiendas cercanas</button>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <input placeholder="Producto a vigilar (ej: lettmelk, egg, kyllingfilet)" value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTerm()} />
        <button className="ghost" disabled={busy || !secret || !newTerm.trim()} onClick={addTerm}>Añadir</button>
      </div>
      {terms.length > 0 && (
        <div className="chips">
          {terms.map((t) => (
            <span key={t} className="chip">{t}{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); if (secret && !busy) removeTerm(t); }} title="Quitar">×</a>
            </span>
          ))}
        </div>
      )}
      {log && <pre className="log">{log}</pre>}
    </div>
  );
}
