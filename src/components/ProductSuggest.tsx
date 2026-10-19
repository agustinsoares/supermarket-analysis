"use client";

import { useEffect, useRef, useState } from "react";
import { api, nok } from "@/lib/client";
import { CHAIN_BY_CODE } from "@/lib/config";
import type { Suggestion } from "@/app/api/catalog/search/route";

/** Cuadro de búsqueda con sugerencias del catálogo. `onPick` recibe el producto elegido; `onText` el texto libre. */
export default function ProductSuggest({ onPick, onText, placeholder, label }: { onPick: (s: Suggestion) => void; onText?: (text: string) => void; placeholder: string; label: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await api<{ results: Suggestion[] }>(`/api/catalog/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        setResults(r.results);
        setOpen(true);
      } catch { /* cancelado o sin red: se ignora */ }
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="suggest" ref={box}>
      <input aria-label={label} placeholder={placeholder} value={q} autoComplete="off"
        onChange={(e) => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onText) { e.preventDefault(); if (q.trim()) { onText(q.trim()); setQ(""); setResults([]); setOpen(false); } }
          if (e.key === "Escape") setOpen(false);
        }} />
      {open && results.length > 0 && (
        <div className="suggest-list" role="listbox">
          {results.map((s) => (
            <button type="button" key={s.itemId} role="option" aria-selected="false"
              onClick={() => { onPick(s); setQ(""); setResults([]); setOpen(false); }}>
              {s.image ? <img src={s.image} alt="" /> : <span className="ph" aria-hidden>{s.name.slice(0, 1).toUpperCase()}</span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: "block", fontWeight: 600, overflowWrap: "anywhere" }}>{s.name}</b>
                <span className="muted">{[s.brand, s.grams ? `${s.grams} g` : null].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <span className="price-tag">{nok(s.price)}<small>{CHAIN_BY_CODE.get(s.chain as never)?.short ?? s.chain}{s.chains > 1 ? ` +${s.chains - 1}` : ""}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
