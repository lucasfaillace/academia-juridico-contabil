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
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const validMeasurementId = /^G-[A-Z0-9]+$/i.test(measurementId || "") ? measurementId : undefined;

  useEffect(() => {
    const sync = () => setConsent(readConsent());
    sync();
    window.addEventListener(analyticsConsentEvent, sync);
    return () => window.removeEventListener(analyticsConsentEvent, sync);
  }, []);

  useEffect(() => {
    if (!ready || consent !== "granted" || !validMeasurementId || !window.gtag) return;
    const query = searchParams.toString();
    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_path: `${pathname}${query ? `?${query}` : ""}`,
      page_title: document.title,
    });
  }, [consent, pathname, ready, searchParams, validMeasurementId]);

  function choose(value: Exclude<Consent, null>) {
    window.localStorage.setItem(analyticsConsentKey, value);
    window.gtag?.("consent", "update", { analytics_storage: value });
    setConsent(value);
    window.dispatchEvent(new Event(analyticsConsentEvent));
  }

  return (
    <>
      {consent === "granted" && validMeasurementId && (
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(validMeasurementId)}`}
          strategy="afterInteractive"
          onLoad={() => {
            window.dataLayer = window.dataLayer || [];
            window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
            window.gtag("consent", "update", { analytics_storage: "granted" });
            window.gtag("js", new Date());
            window.gtag("config", validMeasurementId, {
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
