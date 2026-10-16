"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export default function Login() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/login", { method: "POST", json: { secret } });
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={submit}>
        <div>
          <h1>🛒 Supermarket</h1>
          <p className="muted">Rema 1000 · Kiwi · Extra — Solheim Nord</p>
        </div>
        <label className="field">
          <span>Clave de acceso</span>
          <input type="password" autoComplete="current-password" autoFocus required value={secret} onChange={(e) => setSecret(e.target.value)} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy || !secret}>{busy ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}
