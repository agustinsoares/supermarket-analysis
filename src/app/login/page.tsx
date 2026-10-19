"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/login", { method: "POST", json: { username, password } });
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
          <span>Usuario</span>
          <input type="text" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            autoFocus required maxLength={50} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input type="password" name="password" autoComplete="current-password" required maxLength={200}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy || !username || !password}>{busy ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}
