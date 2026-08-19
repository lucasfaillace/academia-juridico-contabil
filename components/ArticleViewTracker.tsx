"use client";

import { useCallback, useEffect, useRef } from "react";
import { analyticsConsentEvent, analyticsConsentKey } from "./AnalyticsConsent";

export function ArticleViewTracker({ slug }: { slug: string }) {
  const sent = useRef(false);
  const record = useCallback(() => {
    if (sent.current || window.localStorage.getItem(analyticsConsentKey) !== "granted") return;
    sent.current = true;
    void fetch(`/api/articles/${encodeURIComponent(slug)}/views`, {
      method: "POST",
      headers: { "x-analytics-consent": "granted" },
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {
      sent.current = false;
    });
  }, [slug]);

  useEffect(() => {
    record();
    window.addEventListener(analyticsConsentEvent, record);
    return () => window.removeEventListener(analyticsConsentEvent, record);
  }, [record]);

  return null;
}
