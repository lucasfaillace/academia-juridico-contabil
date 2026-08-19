"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

type ZoomedImage = {
  src: string;
  alt: string;
  caption: string;
};

export function ArticleRichContent({ html }: { html: string }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);
  const [zoomedImage, setZoomedImage] = useState<ZoomedImage>();

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const zoomableFigures = Array.from(content.querySelectorAll<HTMLElement>('figure[data-image-zoom="true"]'));
    for (const figure of zoomableFigures) {
      const image = figure.querySelector("img");
      if (!image) continue;
      figure.tabIndex = 0;
      figure.setAttribute("role", "button");
      figure.setAttribute("aria-label", `Ampliar imagem${image.alt ? `: ${image.alt}` : ""}`);
    }

    function openFigure(figure: HTMLElement) {
      const image = figure.querySelector("img");
      if (!image?.getAttribute("src")) return;
      lastTriggerRef.current = figure;
      setZoomedImage({
        src: image.getAttribute("src") || "",
        alt: image.getAttribute("alt") || "",
        caption: figure.querySelector("figcaption")?.textContent?.trim() || "",
      });
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const figure = target.closest<HTMLElement>('figure[data-image-zoom="true"]');
      if (figure) openFigure(figure);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!["Enter", " "].includes(event.key) || !(event.target instanceof HTMLElement)) return;
      const figure = event.target.closest<HTMLElement>('figure[data-image-zoom="true"]');
      if (!figure) return;
      event.preventDefault();
      openFigure(figure);
    }

    content.addEventListener("click", handleClick);
    content.addEventListener("keydown", handleKeyDown);
    return () => {
      content.removeEventListener("click", handleClick);
      content.removeEventListener("keydown", handleKeyDown);
    };
  }, [html]);

  useEffect(() => {
    if (!zoomedImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setZoomedImage(undefined);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      lastTriggerRef.current?.focus();
    };
  }, [zoomedImage]);

  return (
    <>
      <div ref={contentRef} dangerouslySetInnerHTML={{ __html: html }} />
      {zoomedImage && (
        <div
          className="article-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={zoomedImage.alt ? `Imagem ampliada: ${zoomedImage.alt}` : "Imagem ampliada"}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setZoomedImage(undefined);
          }}
        >
          <div className="article-image-lightbox-panel">
            <button type="button" autoFocus onClick={() => setZoomedImage(undefined)} aria-label="Fechar imagem ampliada">
              <X aria-hidden="true" />
            </button>
            {zoomedImage.caption && <p>{zoomedImage.caption}</p>}
            <img src={zoomedImage.src} alt={zoomedImage.alt} />
          </div>
        </div>
      )}
    </>
  );
}
