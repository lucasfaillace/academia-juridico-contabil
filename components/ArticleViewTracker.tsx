"use client";

import { useEffect, useRef } from "react";

export function ArticleViewTracker({ slug }: { slug: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch(`/api/articles/${encodeURIComponent(slug)}/views`, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {
      sent.current = false;
    });
  }, [slug]);

  return null;
}
