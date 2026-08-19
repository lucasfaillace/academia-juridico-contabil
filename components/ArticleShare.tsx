"use client";

import { Check, Copy, Mail, MessageCircle, Phone } from "lucide-react";
import { useState } from "react";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

export function ArticleShare({ title, path }: { title: string; path: string }) {
  const [feedback, setFeedback] = useState("");

  function articleUrl() {
    return new URL(path, window.location.origin).href;
  }

  function openShare(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyArticleLink(message = "Link copiado.") {
    try {
      await copyText(articleUrl());
      setFeedback(message);
      window.setTimeout(() => setFeedback(""), 3500);
    } catch {
      setFeedback("Não foi possível copiar o link.");
    }
  }

  async function shareToInstagram() {
    const url = articleUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title, text: title, url });
        setFeedback("Menu de compartilhamento aberto.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copyArticleLink("Link copiado para compartilhar no Instagram.");
  }

  return (
    <div className="share-row" aria-label="Compartilhar artigo">
      <span className="share-label">Compartilhar</span>
      <button
        type="button"
        onClick={() => openShare(`https://wa.me/?text=${encodeURIComponent(`${title}\n${articleUrl()}`)}`)}
        aria-label="Compartilhar no WhatsApp"
        title="WhatsApp"
      >
        <span className="share-whatsapp-icon" aria-hidden="true"><MessageCircle /><Phone /></span>
      </button>
      <button
        type="button"
        onClick={() => openShare(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl())}`)}
        aria-label="Compartilhar no LinkedIn"
        title="LinkedIn"
      >
        <span className="share-brand-letter share-linkedin-icon" aria-hidden="true">in</span>
      </button>
      <button
        type="button"
        onClick={() => openShare(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(articleUrl())}`)}
        aria-label="Compartilhar no Facebook"
        title="Facebook"
      >
        <span className="share-brand-letter share-facebook-icon" aria-hidden="true">f</span>
      </button>
      <button
        type="button"
        onClick={() => void shareToInstagram()}
        aria-label="Compartilhar pelo Instagram ou por outro aplicativo"
        title="Instagram e outros aplicativos"
      >
        <span className="share-instagram-icon" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => {
          const body = `Leia este artigo da Academia Jurídico-Contábil:\n\n${title}\n${articleUrl()}`;
          window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
        }}
        aria-label="Compartilhar por e-mail"
        title="E-mail"
      >
        <Mail aria-hidden="true" />
      </button>
      <button type="button" onClick={() => void copyArticleLink()} aria-label="Copiar link do artigo" title="Copiar link">
        {feedback.startsWith("Link copiado") ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      <span className="share-feedback" role="status" aria-live="polite">{feedback}</span>
    </div>
  );
}
