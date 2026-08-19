"use client";
import { useState } from "react";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("sending");
    const form = event.currentTarget; const data = Object.fromEntries(new FormData(form));
    try { const response = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); if (!response.ok) throw new Error(); form.reset(); setStatus("success"); } catch { setStatus("error"); }
  }
  return <form className="contact-form" onSubmit={submit}>
    <div className="honeypot" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
    <div className="form-grid"><label>Nome<input name="name" required minLength={2} autoComplete="name" /></label><label>E-mail<input name="email" required type="email" autoComplete="email" /></label></div>
    <label>Assunto<input name="subject" required minLength={3} /></label>
    <label>Mensagem<textarea name="message" required minLength={20} rows={8} /></label>
    <label className="checkbox"><input name="consent" type="checkbox" value="true" required /><span>Li a <a href="/privacidade">Política de Privacidade</a> e concordo com o tratamento dos dados para resposta a esta mensagem.</span></label>
    <button className="button primary" disabled={status === "sending"}>{status === "sending" ? "Enviando…" : "Enviar mensagem"}</button>
    <p className="form-status" aria-live="polite">{status === "success" && "Mensagem recebida. Obrigado pelo contato."}{status === "error" && "Não foi possível enviar agora. Tente novamente em instantes."}</p>
  </form>;
}
