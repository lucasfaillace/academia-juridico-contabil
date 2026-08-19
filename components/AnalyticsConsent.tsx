"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export const analyticsConsentKey = "academia_analytics_consent";
export const analyticsConsentEvent = "academia:analytics-consent";

type Consent = "granted" | "denied" | null;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function readConsent(): Consent {
  const value = window.localStorage.getItem(analyticsConsentKey);
  return value === "granted" || value === "denied" ? value : null;
}

export function AnalyticsConsent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [consent, setConsent] = useState<Consent>(null);
  const [ready, setReady] = useState(false);
  const [measurementId, setMeasurementId] = useState<string>();
  const analyticsAllowedPath = pathname !== "/admin" && !pathname.startsWith("/admin/");

  useEffect(() => {
    const sync = () => setConsent(readConsent());
    sync();
    window.addEventListener(analyticsConsentEvent, sync);
    return () => window.removeEventListener(analyticsConsentEvent, sync);
  }, []);

  useEffect(() => {
    if (consent !== "granted" || !analyticsAllowedPath) return;
    let active = true;
    void fetch("/api/analytics/config", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : { enabled: false, measurementId: "" })
      .then((config: { enabled?: unknown; measurementId?: unknown }) => {
        if (!active) return;
        const value = typeof config.measurementId === "string" ? config.measurementId : "";
        setMeasurementId(config.enabled === true && /^G-[A-Z0-9]+$/i.test(value) ? value : undefined);
      })
      .catch(() => { if (active) setMeasurementId(undefined); });
    return () => { active = false; };
  }, [analyticsAllowedPath, consent]);

  useEffect(() => {
    if (!analyticsAllowedPath || !ready || consent !== "granted" || !measurementId || !window.gtag) return;
    const query = searchParams.toString();
    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_path: `${pathname}${query ? `?${query}` : ""}`,
      page_title: document.title,
    });
  }, [analyticsAllowedPath, consent, measurementId, pathname, ready, searchParams]);

  function choose(value: Exclude<Consent, null>) {
    window.localStorage.setItem(analyticsConsentKey, value);
    window.gtag?.("consent", "update", { analytics_storage: value });
    setConsent(value);
    window.dispatchEvent(new Event(analyticsConsentEvent));
  }

  if (!analyticsAllowedPath) return null;

  return (
    <>
      {consent === "granted" && measurementId && (
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
          strategy="afterInteractive"
          onReady={() => {
            window.dataLayer = window.dataLayer || [];
            window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
            window.gtag("consent", "update", { analytics_storage: "granted" });
            window.gtag("js", new Date());
            window.gtag("config", measurementId, {
              send_page_view: false,
              anonymize_ip: true,
              allow_google_signals: false,
              allow_ad_personalization_signals: false,
            });
            setReady(true);
          }}
        />
      )}
      {consent === null && (
        <aside className="analytics-consent" aria-label="Preferências de privacidade">
          <div>
            <strong>Estatísticas e privacidade</strong>
            <p>Com sua autorização, usamos uma contagem interna anonimizada e o Google Analytics para compreender o acesso ao conteúdo. Não armazenamos seu endereço IP completo.</p>
          </div>
          <div className="analytics-consent-actions">
            <button type="button" className="button secondary" onClick={() => choose("denied")}>Recusar</button>
            <button type="button" className="button primary" onClick={() => choose("granted")}>Aceitar estatísticas</button>
          </div>
        </aside>
      )}
    </>
  );
}

export function AnalyticsPreferencesButton() {
  function reopen() {
    window.localStorage.removeItem(analyticsConsentKey);
    window.dispatchEvent(new Event(analyticsConsentEvent));
  }
  return <button className="button secondary" type="button" onClick={reopen}>Gerenciar preferências</button>;
}
