"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, resizeImage, uploadToBucket } from "@/lib/client";
import { MANUAL_CHAINS } from "@/lib/config";
import ChainBadge from "./ChainBadge";

export type Flyer = {
  id: number; chain: string; title: string; valid_from: string | null; valid_to: string | null;
  status: "uploaded" | "analyzing" | "review" | "done" | "error";
  units_total: number; units_done: number; items_found: number; error: string | null; updated_at: string;
};

const STATUS: Record<Flyer["status"], { label: string; cls: string }> = {
  uploaded: { label: "Subido", cls: "" },
  analyzing: { label: "Analizando…", cls: "draft" },
  review: { label: "Por revisar", cls: "draft" },
  done: { label: "Listo", cls: "ok" },
  error: { label: "Error", cls: "bad" },
};

const isStale = (f: Flyer) => f.status === "analyzing" && Date.now() - new Date(f.updated_at).getTime() > 3 * 60 * 1000;

export default function FlyersView({ initial }: { initial: Flyer[] }) {
  const [flyers, setFlyers] = useState(initial);
  const [chain, setChain] = useState("REMA_1000");
  const [title, setTitle] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setFlyers((await api<{ flyers: Flyer[] }>("/api/flyers")).flyers);
    } catch { /* se reintenta en el siguiente ciclo */ }
  }, []);

  // Consulta el progreso mientras algún folleto se está analizando.
  const analyzing = flyers.some((f) => f.status === "analyzing" && !isStale(f));
  useEffect(() => {
    if (!analyzing) return;
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [analyzing, refresh]);

  function pickFiles(list: FileList | null) {
    setError("");
    const arr = Array.from(list ?? []);
    const pdfs = arr.filter((f) => f.type === "application/pdf");
    const imgs = arr.filter((f) => f.type.startsWith("image/"));
    if (arr.some((f) => !f.type.startsWith("image/") && f.type !== "application/pdf")) return setError("Solo se admiten PDF o imágenes (JPG, PNG, WebP).");
    if (pdfs.length && imgs.length) return setError("Sube un PDF o varias imágenes, no ambos a la vez.");
    if (pdfs.length > 1) return setError("Sube un solo PDF por folleto.");
    if (pdfs.some((f) => f.size > 50 * 1024 * 1024)) return setError("El PDF supera los 50 MB.");
    setFiles(arr);
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!files.length) return setError("Elige el PDF o las imágenes del folleto.");
    if (validFrom && validTo && validTo < validFrom) return setError("La fecha «hasta» no puede ser anterior a «desde».");
    setBusy(true);
    try {
      const uploaded: { path: string; mime: string; name: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(`Subiendo ${i + 1} de ${files.length}…`);
        const f = files[i];
        const blob = f.type === "application/pdf" ? f : await resizeImage(f, 2000, "image/jpeg", 0.85);
        const { path } = await uploadToBucket("flyers", blob);
        uploaded.push({ path, mime: blob.type, name: f.name });
      }
      await api("/api/flyers", {
        method: "POST",
        json: { chain, title, valid_from: validFrom || null, valid_to: validTo || null, files: uploaded },
      });
      setTitle(""); setValidFrom(""); setValidTo(""); setFiles([]);
      (document.getElementById("flyer-files") as HTMLInputElement | null)?.value && ((document.getElementById("flyer-files") as HTMLInputElement).value = "");
      setProgress("Folleto subido. Pulsa «Analizar con Claude».");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  async function analyze(f: Flyer, restart: boolean) {
    setError("");
    try {
      await api(`/api/flyers/${f.id}/analyze${restart ? "?restart=1" : ""}`, { method: "POST" });
      setFlyers((cur) => cur.map((x) => (x.id === f.id ? { ...x, status: "analyzing", error: null, updated_at: new Date().toISOString() } : x)));
      setTimeout(refresh, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(f: Flyer) {
    if (!confirm(`¿Eliminar el folleto «${f.title}»? Se borran sus archivos y los productos aún en borrador.`)) return;
    try {
      await api(`/api/flyers/${f.id}`, { method: "DELETE" });
      setFlyers((cur) => cur.filter((x) => x.id !== f.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Folletos</h1>
          <p className="muted">Sube un folleto y Claude lee las ofertas. Tú revisas antes de que cuenten en la comparación.</p>
        </div>
      </div>

      <form className="card" onSubmit={upload}>
        <div className="card-head"><h2>Subir folleto</h2></div>
        <div className="form-grid">
          <label className="field">
            <span>Supermercado</span>
            <select value={chain} onChange={(e) => setChain(e.target.value)}>
              {MANUAL_CHAINS.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Título <small>(texto)</small></span>
            <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kundeavis uke 42" />
          </label>
          <label className="field">
            <span>Válido desde <small>(fecha)</small></span>
            <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>Válido hasta <small>(fecha)</small></span>
            <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
          </label>
          <label className="field full">
            <span>Archivos <small>(un PDF, o varias imágenes de las páginas)</small></span>
            <input id="flyer-files" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => pickFiles(e.target.files)} />
          </label>
        </div>
        {files.length > 0 && <p className="muted" style={{ marginTop: 8 }}>{files.length} {files.length === 1 ? "archivo" : "archivos"} · {(files.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1)} MB</p>}
        {error && <p className="err" role="alert" style={{ marginTop: 8 }}>{error}</p>}
        {progress && !error && <p className="ok" style={{ marginTop: 8 }}>{progress}</p>}
        <div className="modal-foot" style={{ justifyContent: "flex-start" }}>
          <button className="btn primary" disabled={busy}>{busy ? "Subiendo…" : "Subir folleto"}</button>
        </div>
      </form>

      {flyers.length === 0 && <div className="card empty">Todavía no has subido ningún folleto.</div>}

      {flyers.map((f) => {
        const stale = isStale(f);
        const st = stale ? { label: "Interrumpido", cls: "bad" } : STATUS[f.status];
        const pct = f.units_total ? Math.round((f.units_done / f.units_total) * 100) : 0;
        return (
          <article key={f.id} className="card flyer">
            <div className="flyer-top">
              <div className="row">
                <ChainBadge code={f.chain} />
                <strong>{f.title}</strong>
              </div>
              <span className={`tag ${st.cls}`}>{st.label}</span>
            </div>
            <div className="muted">
              {(f.valid_from || f.valid_to) ? `${f.valid_from ?? "…"} → ${f.valid_to ?? "…"} · ` : ""}
              {f.items_found} productos leídos
            </div>
            {(f.status === "analyzing" || f.units_done > 0) && f.units_total > 0 && (
              <>
                <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
                <div className="muted">{f.units_done} de {f.units_total} partes</div>
              </>
            )}
            {f.error && <p className="err">{f.error}</p>}
            <div className="row">
              {(f.status === "uploaded") && <button className="btn primary small" onClick={() => analyze(f, false)}>Analizar con Claude</button>}
              {(f.status === "error" || stale) && <button className="btn primary small" onClick={() => analyze(f, false)}>Reanudar</button>}
              {(f.status === "review" || f.status === "done" || f.status === "error") && (
                <button className="btn small" onClick={() => confirm("Se vuelve a leer todo el folleto y se reemplazan los borradores. ¿Seguir?") && analyze(f, true)}>Volver a analizar</button>
              )}
              {f.status === "review" && <Link className="btn primary small" href={`/products?status=draft&flyer=${f.id}`}>Revisar productos</Link>}
              <button className="btn danger small" onClick={() => remove(f)}>Eliminar</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
