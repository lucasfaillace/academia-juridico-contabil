"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function LoginForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setError(""); setLoading(true); const body = Object.fromEntries(new FormData(event.currentTarget)); const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); setLoading(false); if (!response.ok) { setError("E-mail ou senha inválidos."); return; } router.push("/admin"); router.refresh(); }
  return <form className="login-form" onSubmit={submit}><label>E-mail<input name="email" type="email" required autoComplete="username" /></label><label>Senha<input name="password" type="password" required autoComplete="current-password" /></label><button className="button primary" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</button><p className="form-status" aria-live="polite">{error}</p></form>;
}
