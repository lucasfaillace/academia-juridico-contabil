"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const analyticsNoticeKey = "academia_analytics_notice_closed";
const analyticsNoticeEvent = "academia:analytics-notice";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function readNoticeClosed() {
  return window.localStorage.getItem(analyticsNoticeKey) === "closed";
}

export function AnalyticsConsent({ initialMeasurementId }: { initialMeasurementId?: string } = {}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [noticeClosed, setNoticeClosed] = useState(true);
  const [ready, setReady] = useState(false);
  const [measurementId, setMeasurementId] = useState<string | undefined>(initialMeasurementId);
  const initialPageViewSent = useRef(false);
  const analyticsAllowedPath = pathname !== "/admin" && !pathname.startsWith("/admin/");

  useEffect(() => {
    const sync = () => setNoticeClosed(readNoticeClosed());
    sync();
    window.addEventListener(analyticsNoticeEvent, sync);
    return () => window.removeEventListener(analyticsNoticeEvent, sync);
  }, []);

  useEffect(() => {
    if (!analyticsAllowedPath) return;
    let active = true;
    void fetch("/api/analytics/config", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : { enabled: false, measurementId: "" })
      .then((config: { enabled?: unknown; measurementId?: unknown }) => {
        if (!active) return;
        const value = typeof config.measurementId === "string" ? config.measurementId : "";
        const nextMeasurementId = config.enabled === true && /^G-[A-Z0-9]+$/i.test(value) ? value : undefined;
        setMeasurementId(nextMeasurementId);
      })
      .catch(() => { if (active) setMeasurementId(undefined); });
    return () => { active = false; };
  }, [analyticsAllowedPath]);

  useEffect(() => {
    if (!analyticsAllowedPath || !ready || !measurementId || !window.gtag) return;
    if (!initialPageViewSent.current) {
      initialPageViewSent.current = true;
      return;
    }
    const query = searchParams.toString();
    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_path: `${pathname}${query ? `?${query}` : ""}`,
      page_title: document.title,
    });
  }, [analyticsAllowedPath, measurementId, pathname, ready, searchParams]);

  function closeNotice() {
    window.localStorage.setItem(analyticsNoticeKey, "closed");
    setNoticeClosed(true);
    window.dispatchEvent(new Event(analyticsNoticeEvent));
  }

  if (!analyticsAllowedPath) return null;

  return (
    <>
      {measurementId && (
        <>
          <Script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
            strategy="afterInteractive"
          />
          <Script
            id={`google-analytics-bootstrap-${measurementId}`}
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}');`,
            }}
            onReady={() => setReady(true)}
          />
        </>
      )}
      {!noticeClosed && (
        <aside className="analytics-consent" aria-label="Aviso de cookies">
          <div>
            <strong>Cookies e tecnologias</strong>
            <p>Utilizamos cookies e tecnologia para aprimorar sua experiência de navegação.</p>
          </div>
          <div className="analytics-consent-actions">
            <button type="button" className="button primary" onClick={closeNotice}>Fechar</button>
          </div>
        </aside>
      )}
    </>
  );
}

export function AnalyticsPreferencesButton() {
  function reopen() {
    window.localStorage.removeItem(analyticsNoticeKey);
    window.dispatchEvent(new Event(analyticsNoticeEvent));
  }
  return <button className="button secondary" type="button" onClick={reopen}>Exibir aviso de cookies</button>;
}
