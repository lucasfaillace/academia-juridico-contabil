"use client";

import { Node } from "@tiptap/core";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, type Editor, type NodeViewProps, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import katex from "katex";
import { useEffect, useRef, useState } from "react";
import {
  abbreviatedReferenceText,
  decodeFootnoteSegments,
  encodeFootnoteSegments,
  normalizedReferenceLocation,
  removeTerminalReferencePeriod,
  replacesTerminalReferencePeriod,
  type FootnoteReferenceSegment,
  type FootnoteSegment,
} from "@/lib/footnote-segments";
import { PublicationReferenceEditor } from "./PublicationReferenceEditor";

export type BibliographicReference = {
  id: string;
  referenceText: string;
  referenceHtml: string;
  fichamentoCount?: number;
};
type ReferenceFichamento = {
  id: string;
  literalQuote: string;
  paraphrase: string;
  location: string;
  personalNote: string;
  topics: Array<{ id: string; name: string }>;
};
type FootnoteItem = {
  id: string;
  number: number;
  text: string;
  referenceId: string;
  citationDetails: string;
  segments: FootnoteSegment[];
  position: number;
};
type ImageSelection = {
  position: number;
  src: string;
  mobileSrc: string;
  imageWidth: number;
  imageHeight: number;
  originalSrc: string;
  trimmedSrc: string;
  alt: string;
  caption: string;
  width: string;
  align: string;
  fit: "crop" | "contain";
  zoom: boolean;
  border: boolean;
};
type FormulaSelection = { position: number; latex: string };
type LinkableArticle = { title: string; slug: string };
type InternalLinkSelection = { from: number; to: number; linked: boolean };
type UploadedImage = {
  url: string;
  mobileUrl: string;
  width: number;
  height: number;
  mobileWidth: number;
  mobileHeight: number;
};

function renderLatex(latex: string) {
  if (!latex.trim()) return "";
  return katex.renderToString(latex, { displayMode: true, throwOnError: false, strict: false });
}

async function cropEmptyImageMargins(file: File): Promise<File | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width * height > 36_000_000) return null;

    const source = document.createElement("canvas");
    source.width = width;
    source.height = height;
    const context = source.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, width, height).data;
    const cornerIndexes = [0, (width - 1) * 4, (height - 1) * width * 4, (width * height - 1) * 4];
    const background = cornerIndexes.reduce(
      (sum, index) => [sum[0] + pixels[index], sum[1] + pixels[index + 1], sum[2] + pixels[index + 2], sum[3] + pixels[index + 3]],
      [0, 0, 0, 0],
    ).map((value) => value / cornerIndexes.length);
    const differsFromBackground = (index: number) => {
      const alpha = pixels[index + 3];
      if (background[3] < 20) return alpha > 20;
      return Math.max(
        Math.abs(pixels[index] - background[0]),
        Math.abs(pixels[index + 1] - background[1]),
        Math.abs(pixels[index + 2] - background[2]),
        Math.abs(alpha - background[3]),
      ) > 18;
    };

    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (!differsFromBackground((y * width + x) * 4)) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < left || bottom < top) return null;

    const safety = Math.min(24, Math.max(8, Math.round(Math.min(width, height) * 0.018)));
    left = Math.max(0, left - safety);
    right = Math.min(width - 1, right + safety);
    top = Math.max(0, top - safety);
    bottom = Math.min(height - 1, bottom + safety);
    if (left < 5 && top < 5 && width - 1 - right < 5 && height - 1 - bottom < 5) return null;

    const croppedWidth = right - left + 1;
    const croppedHeight = bottom - top + 1;
    const output = document.createElement("canvas");
    output.width = croppedWidth;
    output.height = croppedHeight;
    const outputContext = output.getContext("2d");
    if (!outputContext) return null;
    outputContext.drawImage(source, left, top, croppedWidth, croppedHeight, 0, 0, croppedWidth, croppedHeight);
    const outputType = file.type === "image/jpeg" || file.type === "image/webp" ? file.type : "image/png";
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, outputType, 0.96));
    if (!blob || blob.size > 8 * 1024 * 1024) return null;
    const extension = outputType === "image/jpeg" ? "jpg" : outputType.split("/")[1];
    const baseName = file.name.replace(/\.[^.]+$/, "") || "imagem";
    return new File([blob], `${baseName}-ajustada.${extension}`, { type: outputType });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function FormulaNodeView({ node, selected }: NodeViewProps) {
  const latex = String(node.attrs.latex || "");
  return (
    <NodeViewWrapper
      className={`editor-formula-preview${selected ? " is-selected" : ""}`}
      data-article-formula-preview=""
      aria-label="Prévia da fórmula matemática"
    >
      <div dangerouslySetInnerHTML={{ __html: renderLatex(latex) }} />
      <code>{latex}</code>
    </NodeViewWrapper>
  );
}

const Footnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: null, parseHTML: (element) => element.getAttribute("data-footnote-id") },
      number: { default: 1, parseHTML: (element) => Number(element.getAttribute("data-footnote-number") || 1) },
      text: { default: "", parseHTML: (element) => element.getAttribute("data-footnote-text") || "" },
      referenceId: { default: "", parseHTML: (element) => element.getAttribute("data-footnote-reference-id") || "" },
      citationDetails: { default: "", parseHTML: (element) => element.getAttribute("data-footnote-citation-details") || "" },
      segments: {
        default: [],
        parseHTML: (element) => decodeFootnoteSegments(element.getAttribute("data-footnote-segments"), {
          text: element.getAttribute("data-footnote-text") || "",
          referenceId: element.getAttribute("data-footnote-reference-id") || "",
          citationDetails: element.getAttribute("data-footnote-citation-details") || "",
        }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const id = String(HTMLAttributes.id || "");
    const number = Number(HTMLAttributes.number || 1);
    const text = String(HTMLAttributes.text || "");
    const referenceId = String(HTMLAttributes.referenceId || "");
    const citationDetails = String(HTMLAttributes.citationDetails || "");
    const segments = decodeFootnoteSegments(
      Array.isArray(HTMLAttributes.segments) ? JSON.stringify(HTMLAttributes.segments) : "",
      { text, referenceId, citationDetails },
    );
    const textSummary = segments
      .filter((segment) => segment.type === "text")
      .map((segment) => footnotePlainText(segment.html))
      .join(" ");
    const firstReference = segments.find((segment) => segment.type === "reference");
    return [
      "sup",
      {
        "data-footnote": "",
        "data-footnote-id": id,
        "data-footnote-number": String(number),
        "data-footnote-text": textSummary,
        ...(firstReference?.type === "reference" && firstReference.referenceId
          ? { "data-footnote-reference-id": firstReference.referenceId }
          : {}),
        "data-footnote-segments": encodeFootnoteSegments(segments),
        id: `ref-${id}`,
        title: textSummary || `Nota ${number}`,
      },
      ["a", { href: `#nota-${id}`, "aria-label": `Ir para a nota ${number}` }, String(number)],
    ];
  },
});

const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div[data-article-toc]" }];
  },
  renderHTML() {
    return ["div", { "data-article-toc": "", class: "editor-toc-placeholder" }, "Sumário automático"];
  },
});

const ArticleImage = Node.create({
  name: "articleImage",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      src: { default: null, parseHTML: (element) => element.querySelector("img")?.getAttribute("src") },
      mobileSrc: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-image-mobile-src") || element.querySelector("source")?.getAttribute("srcset") || "",
      },
      imageWidth: { default: 0, parseHTML: (element) => Number(element.querySelector("img")?.getAttribute("width") || 0) },
      imageHeight: { default: 0, parseHTML: (element) => Number(element.querySelector("img")?.getAttribute("height") || 0) },
      originalSrc: { default: "", parseHTML: (element) => element.getAttribute("data-image-original-src") || "" },
      trimmedSrc: { default: "", parseHTML: (element) => element.getAttribute("data-image-trimmed-src") || "" },
      alt: { default: "", parseHTML: (element) => element.querySelector("img")?.getAttribute("alt") || "" },
      caption: { default: "", parseHTML: (element) => element.querySelector("figcaption")?.textContent || "" },
      width: { default: "100", parseHTML: (element) => element.getAttribute("data-image-width") || "100" },
      align: { default: "center", parseHTML: (element) => element.getAttribute("data-image-align") || "center" },
      fit: { default: "contain", parseHTML: (element) => element.getAttribute("data-image-fit") === "crop" ? "crop" : "contain" },
      zoom: { default: false, parseHTML: (element) => element.getAttribute("data-image-zoom") === "true" },
      border: { default: false, parseHTML: (element) => element.getAttribute("data-image-border") === "site" },
    };
  },
  parseHTML() {
    return [{ tag: "figure[data-article-image]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const caption = String(HTMLAttributes.caption || "");
    const src = String(HTMLAttributes.src || "");
    const mobileSrc = String(HTMLAttributes.mobileSrc || "");
    const imageWidth = Number(HTMLAttributes.imageWidth || 0);
    const imageHeight = Number(HTMLAttributes.imageHeight || 0);
    const image = ["img", {
      src,
      alt: String(HTMLAttributes.alt || ""),
      ...(imageWidth ? { width: String(imageWidth) } : {}),
      ...(imageHeight ? { height: String(imageHeight) } : {}),
      loading: "lazy",
      decoding: "async",
    }];
    return [
      "figure",
      {
        "data-article-image": "",
        "data-image-width": String(HTMLAttributes.width || "100"),
        "data-image-mobile-src": mobileSrc,
        "data-image-original-src": String(HTMLAttributes.originalSrc || HTMLAttributes.src || ""),
        "data-image-trimmed-src": String(HTMLAttributes.trimmedSrc || ""),
        "data-image-align": String(HTMLAttributes.align || "center"),
        "data-image-fit": HTMLAttributes.fit === "crop" ? "crop" : "contain",
        "data-image-zoom": HTMLAttributes.zoom === true || HTMLAttributes.zoom === "true" ? "true" : "false",
        "data-image-border": HTMLAttributes.border === true || HTMLAttributes.border === "true" ? "site" : "false",
      },
      ...(caption ? [["figcaption", {}, caption]] : []),
      [
        "div",
        { "data-image-frame": "" },
        ...(mobileSrc
          ? [["picture", {}, ["source", { media: "(max-width: 600px)", srcset: mobileSrc, type: "image/webp" }], image]]
          : [image]),
      ],
    ];
  },
});

const ArticleFormula = Node.create({
  name: "articleFormula",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      latex: { default: "", parseHTML: (element) => element.getAttribute("data-latex") || "" },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-article-formula]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const latex = String(HTMLAttributes.latex || "");
    return ["div", { "data-article-formula": "", "data-latex": latex, "data-display": "block" }, ["code", {}, latex]];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FormulaNodeView);
  },
  addKeyboardShortcuts() {
    return {
      Backspace: () => this.editor.isActive(this.name) ? this.editor.commands.deleteSelection() : false,
      Delete: () => this.editor.isActive(this.name) ? this.editor.commands.deleteSelection() : false,
    };
  },
});

function collectFootnotes(editor: Editor): FootnoteItem[] {
  const items: FootnoteItem[] = [];
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === "footnote") {
      items.push({
        id: String(node.attrs.id),
        number: Number(node.attrs.number),
        text: String(node.attrs.text || ""),
        referenceId: String(node.attrs.referenceId || ""),
        citationDetails: String(node.attrs.citationDetails || ""),
        segments: decodeFootnoteSegments(
          Array.isArray(node.attrs.segments) ? JSON.stringify(node.attrs.segments) : "",
          {
            text: String(node.attrs.text || ""),
            referenceId: String(node.attrs.referenceId || ""),
            citationDetails: String(node.attrs.citationDetails || ""),
          },
        ),
        position,
      });
    }
  });
  return items;
}

function selectedArticleImage(editor: Editor): ImageSelection | null {
  const position = editor.state.selection.from;
  const node = editor.state.doc.nodeAt(position);
  if (node?.type.name !== "articleImage") return null;
  return {
    position,
    src: String(node.attrs.src || ""),
    mobileSrc: String(node.attrs.mobileSrc || ""),
    imageWidth: Number(node.attrs.imageWidth || 0),
    imageHeight: Number(node.attrs.imageHeight || 0),
    originalSrc: String(node.attrs.originalSrc || node.attrs.src || ""),
    trimmedSrc: String(node.attrs.trimmedSrc || ""),
    alt: String(node.attrs.alt || ""),
    caption: String(node.attrs.caption || ""),
    width: String(node.attrs.width || "100"),
    align: String(node.attrs.align || "center"),
    fit: node.attrs.fit === "crop" ? "crop" : "contain",
    zoom: Boolean(node.attrs.zoom),
    border: node.attrs.border !== false,
  };
}

function selectedArticleFormula(editor: Editor): FormulaSelection | null {
  const position = editor.state.selection.from;
  const node = editor.state.doc.nodeAt(position);
  if (node?.type.name !== "articleFormula") return null;
  return { position, latex: String(node.attrs.latex || "") };
}

function selectionHasLink(editor: Editor) {
  if (editor.isActive("link")) return true;
  const { from, to, empty } = editor.state.selection;
  if (empty) return false;
  let found = false;
  editor.state.doc.nodesBetween(from, to, (node) => {
    if (node.marks.some((mark) => mark.type.name === "link")) found = true;
  });
  return found;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function footnoteEditorContent(value: string) {
  const content = /<\/?(?:strong|em|b|i|br|a)\b/i.test(value) ? value : escapeHtml(value);
  return `<p>${content}</p>`;
}

function footnoteInlineHtml(editor: Editor) {
  return editor
    .getHTML()
    .replace(/^<p>/, "")
    .replace(/<\/p>$/, "")
    .replace(/<\/p><p>/g, "<br>");
}

function footnotePlainText(value: string) {
  if (typeof document === "undefined") return value.replace(/<[^>]+>/g, "");
  const element = document.createElement("div");
  element.innerHTML = value;
  return element.textContent || "";
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function normalizeFootnoteUrl(value: string) {
  const candidate = value.trim().startsWith("www.") ? `https://${value.trim()}` : value.trim();
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function FootnoteTextEditor({
  number,
  value,
  onChange,
  publishedArticles,
}: {
  number: number;
  value: string;
  onChange: (html: string) => void;
  publishedArticles: LinkableArticle[];
}) {
  const [linkComposerOpen, setLinkComposerOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkSelection, setLinkSelection] = useState<{ from: number; to: number } | null>(null);
  const [internalLinkComposerOpen, setInternalLinkComposerOpen] = useState(false);
  const [internalLinkQuery, setInternalLinkQuery] = useState("");
  const [linkActive, setLinkActive] = useState(false);
  const [linkNotice, setLinkNotice] = useState("");
  const noteEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
    ],
    content: footnoteEditorContent(value),
    onUpdate: ({ editor }) => onChange(footnoteInlineHtml(editor)),
    onSelectionUpdate: ({ editor }) => setLinkActive(editor.isActive("link")),
  });

  if (!noteEditor) return <div className="footnote-editor-loading">Carregando campo da nota…</div>;
  const activeNoteEditor = noteEditor;

  function openLinkComposer() {
    if (activeNoteEditor.isActive("link")) activeNoteEditor.chain().focus().extendMarkRange("link").run();
    const { from, to, empty } = activeNoteEditor.state.selection;
    if (empty && !activeNoteEditor.isActive("link")) {
      setLinkNotice("Selecione a palavra ou o trecho que receberá o link.");
      return;
    }
    setLinkSelection({ from, to });
    setLinkUrl(String(activeNoteEditor.getAttributes("link").href || ""));
    setLinkNotice("");
    setInternalLinkComposerOpen(false);
    setLinkComposerOpen(true);
  }

  function openInternalLinkComposer() {
    if (activeNoteEditor.isActive("link")) activeNoteEditor.chain().focus().extendMarkRange("link").run();
    const { from, to, empty } = activeNoteEditor.state.selection;
    if (empty && !activeNoteEditor.isActive("link")) {
      setLinkNotice("Selecione a palavra ou o trecho que receberá o link interno.");
      return;
    }
    const currentHref = String(activeNoteEditor.getAttributes("link").href || "");
    const currentSlug = currentHref.match(/^\/blog\/([^?#/]+)$/)?.[1];
    const currentArticle = currentSlug
      ? publishedArticles.find((article) => article.slug === decodeURIComponent(currentSlug))
      : undefined;
    setLinkSelection({ from, to });
    setInternalLinkQuery(currentArticle?.title || "");
    setLinkNotice("");
    setLinkComposerOpen(false);
    setInternalLinkComposerOpen(true);
  }

  function saveInternalLink(article: LinkableArticle) {
    if (!linkSelection) return;
    activeNoteEditor
      .chain()
      .focus()
      .setTextSelection(linkSelection)
      .unsetLink()
      .setLink({ href: `/blog/${article.slug}`, target: "_blank", rel: "noopener noreferrer" })
      .run();
    setLinkActive(true);
    setInternalLinkComposerOpen(false);
    setInternalLinkQuery("");
    setLinkNotice(`Link interno inserido para “${article.title}”.`);
  }

  function saveLink() {
    const href = normalizeFootnoteUrl(linkUrl);
    if (!href) {
      setLinkNotice("Informe um endereço iniciado por https://, http:// ou www.");
      return;
    }
    if (!linkSelection) return;
    activeNoteEditor
      .chain()
      .focus()
      .setTextSelection(linkSelection)
      .setLink({ href, target: "_blank", rel: "noopener noreferrer" })
      .run();
    setLinkActive(true);
    setLinkComposerOpen(false);
    setLinkNotice("Link inserido na nota.");
  }

  function removeLink() {
    activeNoteEditor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkActive(false);
    setLinkComposerOpen(false);
    setInternalLinkComposerOpen(false);
    setLinkUrl("");
    setInternalLinkQuery("");
    setLinkNotice("Link removido; o texto foi preservado.");
  }

  return (
    <div className="footnote-text-editor">
      <div className="footnote-formatting" role="toolbar" aria-label={`Formatação de texto da nota ${number}`}>
        <button
          type="button"
          className={noteEditor.isActive("bold") ? "is-active" : ""}
          onClick={() => noteEditor.chain().focus().toggleBold().run()}
        >
          Negrito
        </button>
        <button
          type="button"
          className={noteEditor.isActive("italic") ? "is-active" : ""}
          onClick={() => noteEditor.chain().focus().toggleItalic().run()}
        >
          Itálico
        </button>
        <button
          type="button"
          className={linkActive && !String(noteEditor.getAttributes("link").href || "").startsWith("/blog/") ? "is-active" : ""}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openLinkComposer}
        >
          Link externo
        </button>
        <button
          type="button"
          className={linkActive && String(noteEditor.getAttributes("link").href || "").startsWith("/blog/") ? "is-active" : ""}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openInternalLinkComposer}
        >
          Link interno
        </button>
        <button
          type="button"
          className="footnote-remove-link"
          disabled={!linkActive}
          onMouseDown={(event) => event.preventDefault()}
          onClick={removeLink}
        >
          Remover link
        </button>
      </div>
      {linkComposerOpen && (
        <div className="footnote-link-composer">
          <label>
            Endereço do site
            <input
              type="url"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://exemplo.com.br"
              autoFocus
            />
          </label>
          <div>
            <button type="button" onClick={saveLink}>Aplicar link</button>
            <button type="button" onClick={() => setLinkComposerOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {internalLinkComposerOpen && linkSelection && (
        <div className="footnote-internal-link-composer" aria-label="Inserção de link para outro artigo na nota">
          <label>
            Pesquisar artigo publicado
            <input
              type="search"
              value={internalLinkQuery}
              onChange={(event) => setInternalLinkQuery(event.target.value)}
              placeholder="Digite parte do título"
              autoFocus
            />
          </label>
          <div className="footnote-internal-link-results" role="listbox" aria-label="Artigos publicados">
            {publishedArticles
              .filter((article) => !internalLinkQuery || normalizeSearch(article.title).includes(normalizeSearch(internalLinkQuery)))
              .map((article) => (
                <button
                  key={article.slug}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => saveInternalLink(article)}
                >
                  <span>{article.title}</span>
                  <small>/blog/{article.slug}</small>
                </button>
              ))}
            {!publishedArticles.some((article) =>
              !internalLinkQuery || normalizeSearch(article.title).includes(normalizeSearch(internalLinkQuery))
            ) && <p>Nenhum artigo publicado encontrado.</p>}
          </div>
          <button type="button" onClick={() => setInternalLinkComposerOpen(false)}>Cancelar</button>
        </div>
      )}
      <EditorContent editor={noteEditor} />
      {linkNotice && <p className="footnote-link-notice" aria-live="polite">{linkNotice}</p>}
    </div>
  );
}

function FootnoteReferenceFichamentos({
  reference,
  onInsertText,
}: {
  reference: BibliographicReference;
  onInsertText: (text: string, kind: "literal" | "paraphrase") => void;
}) {
  const [items, setItems] = useState<ReferenceFichamento[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);

  async function loadFichamentos() {
    if (items || loading) return;
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(`/api/reference-fichamentos?referenceId=${encodeURIComponent(reference.id)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os fichamentos.");
      setItems(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível carregar os fichamentos.");
    } finally {
      setLoading(false);
    }
  }

  async function copyField(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copiada.`);
    } catch {
      setNotice("Não foi possível copiar automaticamente. Selecione o texto manualmente.");
    }
  }

  function insertField(value: string, kind: "literal" | "paraphrase") {
    onInsertText(value, kind);
    setNotice(kind === "literal" ? "Citação literal inserida antes da referência." : "Paráfrase inserida antes da referência.");
  }

  const topics = Array.from(
    new Map((items || []).flatMap((item) => item.topics).map((topic) => [topic.id, topic])).values(),
  ).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const normalizedQuery = normalizeSearch(query);
  const visibleItems = (items || []).filter((item) => {
    const matchesQuery = !normalizedQuery || normalizeSearch([
      item.literalQuote,
      item.paraphrase,
      item.location,
      item.personalNote,
      item.topics.map((topic) => topic.name).join(" "),
    ].join(" ")).includes(normalizedQuery);
    const matchesTopics = selectedTopicIds.every((id) => item.topics.some((topic) => topic.id === id));
    return matchesQuery && matchesTopics;
  });

  return (
    <details
      className="footnote-fichamentos"
      onToggle={(event) => {
        if (event.currentTarget.open) void loadFichamentos();
      }}
    >
      <summary>
        Consultar fichamentos desta obra
        {typeof reference.fichamentoCount === "number" && <span>{reference.fichamentoCount}</span>}
      </summary>
      <div className="footnote-fichamentos-body">
        {loading && <p>Carregando fichamentos…</p>}
        {items && items.length > 0 && (
          <>
            <label>
              Pesquisar nos fichamentos
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Digite uma expressão"
              />
            </label>
            {topics.length > 0 && (
              <div className="footnote-fichamento-topics" aria-label="Filtrar fichamentos por tema">
                {topics.map((topic) => {
                  const selected = selectedTopicIds.includes(topic.id);
                  return (
                    <button
                      type="button"
                      key={topic.id}
                      className={selected ? "active" : undefined}
                      aria-pressed={selected}
                      onClick={() => setSelectedTopicIds((current) => selected
                        ? current.filter((id) => id !== topic.id)
                        : [...current, topic.id])}
                    >
                      {topic.name}
                    </button>
                  );
                })}
                {selectedTopicIds.length > 0 && (
                  <button className="clear" type="button" onClick={() => setSelectedTopicIds([])}>Limpar temas</button>
                )}
              </div>
            )}
            <div className="footnote-fichamento-list">
              {visibleItems.map((item) => (
                <article key={item.id}>
                  {item.location && <small>{item.location}</small>}
                  {item.literalQuote && (
                    <section>
                      <strong>Citação literal</strong>
                      <p>{item.literalQuote}</p>
                      <div>
                        <button type="button" onClick={() => insertField(item.literalQuote, "literal")}>Inserir citação na nota</button>
                        <button type="button" onClick={() => void copyField(item.literalQuote, "Citação literal")}>Copiar citação literal</button>
                      </div>
                    </section>
                  )}
                  {item.paraphrase && (
                    <section>
                      <strong>Síntese ou paráfrase</strong>
                      <p>{item.paraphrase}</p>
                      <div>
                        <button type="button" onClick={() => insertField(item.paraphrase, "paraphrase")}>Inserir paráfrase na nota</button>
                        <button type="button" onClick={() => void copyField(item.paraphrase, "Paráfrase")}>Copiar paráfrase</button>
                      </div>
                    </section>
                  )}
                  {item.personalNote && <aside><strong>Observação pessoal</strong><p>{item.personalNote}</p></aside>}
                </article>
              ))}
              {!visibleItems.length && <p>Nenhum fichamento corresponde à pesquisa e aos temas selecionados.</p>}
            </div>
          </>
        )}
        {items && !items.length && <p>Nenhum fichamento cadastrado para esta obra.</p>}
        {notice && <p className="footnote-fichamento-notice" aria-live="polite">{notice}</p>}
      </div>
    </details>
  );
}

function FootnoteBibliographyEditor({
  noteNumber,
  segment,
  previousReferenceId,
  references,
  onChange,
  onInsertFichamentoText,
  onReferenceCreated,
  onReferencesLoaded,
}: {
  noteNumber: number;
  segment: FootnoteReferenceSegment;
  previousReferenceId: string;
  references: BibliographicReference[];
  onChange: (segment: FootnoteReferenceSegment) => void;
  onInsertFichamentoText: (text: string, kind: "literal" | "paraphrase") => void;
  onReferenceCreated: (reference: BibliographicReference) => void;
  onReferencesLoaded?: (references: BibliographicReference[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [remoteReferences, setRemoteReferences] = useState<BibliographicReference[]>([]);
  const [searchingReferences, setSearchingReferences] = useState(false);
  const [creating, setCreating] = useState(false);
  const [referenceDraft, setReferenceDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [similarReferences, setSimilarReferences] = useState<BibliographicReference[]>([]);
  const [saving, setSaving] = useState(false);
  const availableReferences = Array.from(new Map(
    [...references, ...remoteReferences].map((reference) => [reference.id, reference]),
  ).values());
  const selected = availableReferences.find((reference) => reference.id === segment.referenceId);
  const invalidIbid = segment.presentation === "ibid"
    && (!previousReferenceId || segment.referenceId !== previousReferenceId);
  const normalizedQuery = normalizeSearch(query);
  const filteredReferences = availableReferences
    .filter((reference) => !normalizedQuery || normalizeSearch(reference.referenceText).includes(normalizedQuery))
    .slice(0, 12);

  useEffect(() => {
    if (query.trim().length < 2 || selected) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchingReferences(true);
      const parameters = new URLSearchParams({ q: query.trim(), page: "1", pageSize: "20" });
      void fetch(`/api/references?${parameters}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => ({ response, data: await response.json() }))
        .then(({ response, data }) => {
          if (!response.ok) throw new Error(data.error || "Não foi possível pesquisar as referências.");
          const items = Array.isArray(data.items) ? data.items as BibliographicReference[] : [];
          setRemoteReferences(items);
          onReferencesLoaded?.(items);
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setNotice(error instanceof Error ? error.message : "Não foi possível pesquisar as referências.");
          }
        })
        .finally(() => setSearchingReferences(false));
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [onReferencesLoaded, query, selected]);

  async function createReference(confirmSimilar = false) {
    setSaving(true);
    setNotice("");
    const response = await fetch("/api/references", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ referenceHtml: referenceDraft, confirmSimilar }),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      if (data.code === "similar_reference") {
        setSimilarReferences(data.similarReferences || []);
        setNotice("Confira as referências semelhantes antes de cadastrar outra.");
      } else {
        setNotice(data.error || "Não foi possível cadastrar a referência.");
      }
      return;
    }
    const reference = {
      id: data.id,
      referenceText: data.referenceText,
      referenceHtml: data.referenceHtml,
    };
    onReferenceCreated(reference);
    onChange({ ...segment, referenceId: reference.id });
    setCreating(false);
    setReferenceDraft("");
    setSimilarReferences([]);
    setNotice("Referência cadastrada e vinculada à nota.");
  }

  return (
    <fieldset className="footnote-bibliography">
      <legend className="sr-only">Referência bibliográfica da nota {noteNumber}</legend>
      <div className="footnote-reference-fields">
          <div className="footnote-reference-options">
            <label>
              Forma de exibição
              <select
                value={segment.presentation}
                onChange={(event) => {
                  const presentation = event.target.value as FootnoteReferenceSegment["presentation"];
                  onChange({
                    ...segment,
                    presentation,
                    referenceId: presentation === "ibid" && previousReferenceId
                      ? previousReferenceId
                      : segment.referenceId,
                  });
                }}
              >
                <option value="full">Referência completa</option>
                <option value="ibid">Ibid. — mesma obra anterior</option>
                <option value="idem">Id. — mesmo autor</option>
                <option value="opcit">op. cit. — obra citada anteriormente</option>
              </select>
            </label>
            <label>
              Página, capítulo ou localização
              <input
                value={segment.location}
                maxLength={300}
                onChange={(event) => onChange({ ...segment, location: event.target.value })}
                placeholder="Ex.: p. 22; cap. 3; item 14"
              />
            </label>
          </div>
          {segment.presentation === "ibid" && !previousReferenceId && (
            <p className="footnote-reference-warning" role="alert">Ibid. exige uma referência bibliográfica anterior.</p>
          )}
          {invalidIbid && previousReferenceId && (
            <p className="footnote-reference-warning" role="alert">Ibid. deve permanecer vinculado à mesma obra da referência imediatamente anterior.</p>
          )}
          {segment.presentation === "idem" && (
            <p className="footnote-reference-guidance">Use “Id.” apenas quando o autor for o mesmo da referência anterior; selecione abaixo a obra efetivamente citada.</p>
          )}
          {segment.presentation === "opcit" && (
            <p className="footnote-reference-guidance">Insira o sobrenome e a vírgula em um bloco de texto imediatamente anterior. Exemplo: “SILVA,” + “op. cit., p. 22.”</p>
          )}
          {selected ? (
            <>
              <div className="selected-footnote-reference">
                <span>
                  <strong>Referência vinculada</strong>
                  <span dangerouslySetInnerHTML={{ __html: selected.referenceHtml }} />
                </span>
                <button type="button" onClick={() => onChange({ ...segment, referenceId: "" })}>Trocar</button>
              </div>
              <FootnoteReferenceFichamentos
                key={selected.id}
                reference={selected}
                onInsertText={onInsertFichamentoText}
              />
            </>
          ) : (
            <>
              <label>
                Pesquisar referência cadastrada
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Digite autor, título ou expressão" />
              </label>
              <div className="footnote-reference-results">
                {searchingReferences && <p>Pesquisando referências…</p>}
                {filteredReferences.map((reference) => (
                  <button
                    type="button"
                    key={reference.id}
                    onClick={() => {
                      onChange({ ...segment, referenceId: reference.id });
                      setNotice("Referência vinculada à nota.");
                    }}
                  >
                    {reference.referenceText}
                  </button>
                ))}
                {!filteredReferences.length && <p>Nenhuma referência encontrada.</p>}
              </div>
              <button className="footnote-new-reference" type="button" onClick={() => setCreating((current) => !current)}>
                {creating ? "Cancelar nova referência" : "Cadastrar nova referência"}
              </button>
            </>
          )}

          {creating && !selected && (
            <div className="footnote-new-reference-form">
              <div className="bibliographic-reference-editor-field">
                <strong>Dados bibliográficos da obra</strong>
                <PublicationReferenceEditor
                  value={referenceDraft}
                  onChange={(value) => {
                    setReferenceDraft(value);
                    setSimilarReferences([]);
                    setNotice("");
                  }}
                />
              </div>
              {similarReferences.length > 0 && (
                <div className="similar-reference-warning">
                  <strong>Possíveis duplicatas</strong>
                  {similarReferences.map((reference) => <p key={reference.id}>{reference.referenceText}</p>)}
                  <button type="button" onClick={() => void createReference(true)}>Cadastrar mesmo assim</button>
                </div>
              )}
              <button
                className="button secondary"
                type="button"
                disabled={saving || footnotePlainText(referenceDraft).trim().length < 10}
                onClick={() => void createReference()}
              >
                {saving ? "Salvando…" : "Salvar e vincular"}
              </button>
            </div>
          )}

          {notice && <p className="footnote-reference-notice" aria-live="polite">{notice}</p>}
      </div>
    </fieldset>
  );
}

function stripGeneratedFootnotes(value: string) {
  const withoutReferences = value.replace(/<section class="article-references"[\s\S]*?<\/section>\s*$/i, "");
  const withoutFootnotes = withoutReferences.replace(/<section class="footnotes"[\s\S]*?<\/section>\s*$/i, "");
  return withoutFootnotes.replace(
    /<h([234])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_match, level: string, attributes: string, content: string) =>
      `<h${level}${attributes.replace(/\sdata-numbered-heading(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")}>${content.replace(/^(\s*(?:<(?:strong|em|span)[^>]*>)*)\d+(?:\.\d+)*\.\s*/i, "$1")}</h${level}>`,
  );
}

function footnotePreviewText(segments: FootnoteSegment[], references: BibliographicReference[]) {
  const parts = segments.flatMap<{ value: string; type: "text" | "reference" }>((segment) => {
    if (segment.type === "text") {
      const text = footnotePlainText(segment.html).trim();
      return text ? [{ value: text, type: "text" as const }] : [];
    }
    const reference = references.find((item) => item.id === segment.referenceId);
    if (!reference) return [];
    if (segment.presentation !== "full") {
      return [{ value: abbreviatedReferenceText(segment.presentation, segment.location), type: "reference" as const }];
    }
    const location = normalizedReferenceLocation(segment.location).replace(/[.\s]+$/, "");
    return [{
      value: location ? `${removeTerminalReferencePeriod(reference.referenceText)}, ${location}.` : reference.referenceText,
      type: "reference" as const,
    }];
  });
  return parts.reduce((result, part, index) => {
    if (!result) return part.value;
    const normalizedResult = parts[index - 1]?.type === "reference" && replacesTerminalReferencePeriod(part.value)
      ? removeTerminalReferencePeriod(result)
      : result;
    const noSpace = /[(\[{"'“‘—–/-]$/.test(normalizedResult) || /^[,.;:!?)}\]”’]/.test(part.value);
    return `${normalizedResult}${noSpace ? "" : " "}${part.value}`;
  }, "");
}

function previousFootnoteReferenceId(footnotes: FootnoteItem[], noteId: string, segmentIndex: number) {
  let previous = "";
  for (const note of footnotes) {
    for (let index = 0; index < note.segments.length; index += 1) {
      if (note.id === noteId && index === segmentIndex) return previous;
      const segment = note.segments[index];
      if (segment.type === "reference" && segment.referenceId) previous = segment.referenceId;
    }
    if (note.id === noteId && segmentIndex >= note.segments.length) return previous;
  }
  return previous;
}

function footnoteIsIncomplete(item: FootnoteItem, footnotes: FootnoteItem[]) {
  return !item.segments.length
    || item.segments.some((segment) => segment.type === "reference" && !segment.referenceId)
    || item.segments.some((segment, segmentIndex) => segment.type === "reference"
      && segment.presentation === "ibid"
      && previousFootnoteReferenceId(footnotes, item.id, segmentIndex) !== segment.referenceId)
    || item.segments.every((segment) =>
      segment.type === "text" ? !footnotePlainText(segment.html).trim() : !segment.referenceId,
    );
}

function shortenedFootnotePreview(item: FootnoteItem, references: BibliographicReference[]) {
  const preview = footnotePreviewText(item.segments, references);
  if (!preview) return "Nota ainda vazia";
  return preview.length > 115 ? `${preview.slice(0, 112).trimEnd()}…` : preview;
}

function footnoteHtml(segments: FootnoteSegment[], references: BibliographicReference[]) {
  const parts = segments.flatMap<{ value: string; type: "text" | "reference" }>((segment) => {
    if (segment.type === "text") {
      return segment.html.trim()
        ? [{ value: segment.html.trim(), type: "text" as const }]
        : [];
    }
    const reference = references.find((item) => item.id === segment.referenceId);
    if (!reference) return [];
    if (segment.presentation !== "full") {
      const label = segment.presentation === "ibid" ? "Ibid." : segment.presentation === "idem" ? "Id." : "op. cit.";
      const location = normalizedReferenceLocation(segment.location).replace(/[.\s]+$/, "");
      return [{
        value: `<span class="footnote-bibliographic-reference is-abbreviated"><em>${label}</em>${location ? `, ${escapeHtml(location)}.` : ""}</span>`,
        type: "reference" as const,
      }];
    }
    const location = normalizedReferenceLocation(segment.location).replace(/[.\s]+$/, "");
    return [{
      value: `<span class="footnote-bibliographic-reference">${location
        ? `${removeTerminalReferencePeriod(reference.referenceHtml)}, ${escapeHtml(location)}.`
        : reference.referenceHtml}</span>`,
      type: "reference" as const,
    }];
  });
  return parts.reduce((result, part, index) => {
    if (!result) return part.value;
    const right = footnotePlainText(part.value).trim();
    const normalizedResult = parts[index - 1]?.type === "reference" && replacesTerminalReferencePeriod(right)
      ? removeTerminalReferencePeriod(result)
      : result;
    const left = footnotePlainText(normalizedResult).trim();
    const noSpace = /[(\[{"'“‘—–/-]$/.test(left) || /^[,.;:!?)}\]”’]/.test(right);
    return `${normalizedResult}${noSpace ? "" : " "}${part.value}`;
  }, "");
}

function serializeArticle(editor: Editor, references: BibliographicReference[]) {
  const notes = collectFootnotes(editor);
  const content = editor.getHTML();
  if (!notes.length) return content;
  const list = notes
    .map((note, index) => {
      const number = index + 1;
      const noteContent = footnoteHtml(note.segments, references) || `Nota ${number} sem texto.`;
      const id = escapeHtml(note.id);
      return `<li id="nota-${id}"><span class="footnote-number">${number}.</span><span>${noteContent}</span></li>`;
    })
    .join("");
  return `${content}<section class="footnotes" id="notas"><h2>Notas</h2><ol>${list}</ol></section>`;
}

function renumberFootnotes(editor: Editor) {
  const notes = collectFootnotes(editor);
  const transaction = editor.state.tr;
  let changed = false;
  notes.forEach((note, index) => {
    const number = index + 1;
    if (note.number !== number) {
      const node = editor.state.doc.nodeAt(note.position);
      if (node) {
        transaction.setNodeMarkup(note.position, undefined, { ...node.attrs, number });
        changed = true;
      }
    }
  });
  if (changed) editor.view.dispatch(transaction);
}

function newFootnoteSegment(
  type: FootnoteSegment["type"],
  options: { presentation?: FootnoteReferenceSegment["presentation"]; referenceId?: string } = {},
): FootnoteSegment {
  return type === "text"
    ? { id: crypto.randomUUID(), type: "text", html: "" }
    : {
        id: crypto.randomUUID(),
        type: "reference",
        referenceId: options.referenceId || "",
        presentation: options.presentation || "full",
        location: "",
      };
}

export function RichEditor({
  value,
  onChange,
  publishedArticles = [],
  bibliographicReferences = [],
  focusFootnote,
  onReferenceCreated,
  onReferencesLoaded,
}: {
  value: string;
  onChange: (html: string) => void;
  publishedArticles?: LinkableArticle[];
  bibliographicReferences?: BibliographicReference[];
  focusFootnote?: { id: string; requestId: string };
  onReferenceCreated?: (reference: BibliographicReference) => void;
  onReferencesLoaded?: (references: BibliographicReference[]) => void;
}) {
  const [footnotes, setFootnotes] = useState<FootnoteItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imageAdjusting, setImageAdjusting] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadNotice, setUploadNotice] = useState("");
  const [imageSelection, setImageSelection] = useState<ImageSelection | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [newFootnoteId, setNewFootnoteId] = useState("");
  const [openFootnoteIds, setOpenFootnoteIds] = useState<Set<string>>(() => new Set());
  const [formulaSelection, setFormulaSelection] = useState<FormulaSelection | null>(null);
  const [formulaDraft, setFormulaDraft] = useState("");
  const [formulaComposerOpen, setFormulaComposerOpen] = useState(false);
  const [internalLinkOpen, setInternalLinkOpen] = useState(false);
  const [internalLinkQuery, setInternalLinkQuery] = useState("");
  const [internalLinkSelection, setInternalLinkSelection] = useState<InternalLinkSelection | null>(null);
  const [internalLinkNotice, setInternalLinkNotice] = useState("");
  const [linkActive, setLinkActive] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const notesDetails = useRef<HTMLDetailsElement>(null);
  const bibliographicReferencesRef = useRef(bibliographicReferences);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      Footnote,
      TableOfContents,
      ArticleImage,
      ArticleFormula,
    ],
    content: stripGeneratedFootnotes(value),
    onCreate: ({ editor }) => setFootnotes(collectFootnotes(editor)),
    onUpdate: ({ editor }) => {
      setFootnotes(collectFootnotes(editor));
      setLinkActive(selectionHasLink(editor));
      onChange(serializeArticle(editor, bibliographicReferencesRef.current));
    },
    onSelectionUpdate: ({ editor }) => {
      const image = selectedArticleImage(editor);
      const formula = selectedArticleFormula(editor);
      if (image) setImageSelection(image);
      else if (editor.isFocused) setImageSelection(null);
      setFormulaSelection(formula);
      setLinkActive(selectionHasLink(editor));
      if (formula) {
        setFormulaDraft(formula.latex);
        setFormulaComposerOpen(true);
      }
    },
  });

  useEffect(() => {
    if (!editor) return;
    const content = stripGeneratedFootnotes(value);
    if (content !== editor.getHTML()) editor.commands.setContent(content, { emitUpdate: true });
  }, [editor, value]);

  useEffect(() => {
    bibliographicReferencesRef.current = bibliographicReferences;
    if (editor) onChange(serializeArticle(editor, bibliographicReferences));
  }, [bibliographicReferences, editor, onChange]);

  useEffect(() => {
    if (!focusFootnote || !footnotes.some((item) => item.id === focusFootnote.id)) return;
    const frame = requestAnimationFrame(() => {
      setNotesOpen(true);
      setOpenFootnoteIds((current) => new Set(current).add(focusFootnote.id));
      requestAnimationFrame(() => {
        const target = document.getElementById(`editor-footnote-${focusFootnote.id}`);
        const editorSection = target?.closest("details.editor-section") as HTMLDetailsElement | null;
        if (editorSection) editorSection.open = true;
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusFootnote, footnotes]);

  if (!editor) return <div className="editor-loading">Carregando editor…</div>;
  const activeEditor = editor;

  const command = (label: string, active: boolean, action: () => void) => (
    <button
      type="button"
      className={active ? "is-active" : ""}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={action}
    >
      {label}
    </button>
  );

  function addFootnote() {
    const id = crypto.randomUUID();
    activeEditor.chain().focus().insertContent({
      type: "footnote",
      attrs: {
        id,
        number: footnotes.length + 1,
        text: "",
        referenceId: "",
        citationDetails: "",
        segments: [],
      },
    }).run();
    renumberFootnotes(activeEditor);
    setNotesOpen(true);
    setNewFootnoteId(id);
    setOpenFootnoteIds((current) => new Set(current).add(id));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById(`editor-footnote-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }));
  }

  function updateFootnoteSegments(item: FootnoteItem, segments: FootnoteSegment[]) {
    const node = activeEditor.state.doc.nodeAt(item.position);
    if (!node) return;
    const firstReference = segments.find((segment) => segment.type === "reference");
    activeEditor.view.dispatch(activeEditor.state.tr.setNodeMarkup(item.position, undefined, {
      ...node.attrs,
      segments,
      text: segments
        .filter((segment) => segment.type === "text")
        .map((segment) => footnotePlainText(segment.html))
        .join(" "),
      referenceId: firstReference?.type === "reference" ? firstReference.referenceId : "",
      citationDetails: "",
    }));
  }

  function removeFootnote(item: FootnoteItem) {
    const node = activeEditor.state.doc.nodeAt(item.position);
    if (!node) return;
    activeEditor.view.dispatch(activeEditor.state.tr.delete(item.position, item.position + node.nodeSize));
    setOpenFootnoteIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    renumberFootnotes(activeEditor);
  }

  function updateSelectedImage(attributes: Partial<Omit<ImageSelection, "position">>) {
    if (!imageSelection) return;
    const node = activeEditor.state.doc.nodeAt(imageSelection.position);
    if (node?.type.name !== "articleImage") {
      setImageSelection(null);
      return;
    }
    activeEditor.view.dispatch(
      activeEditor.state.tr.setNodeMarkup(
        imageSelection.position,
        undefined,
        { ...node.attrs, ...attributes },
      ),
    );
    setImageSelection({ ...imageSelection, ...attributes });
  }

  function removeSelectedImage() {
    if (!imageSelection) return;
    const node = activeEditor.state.doc.nodeAt(imageSelection.position);
    if (node?.type.name !== "articleImage") {
      setImageSelection(null);
      return;
    }
    activeEditor.view.dispatch(
      activeEditor.state.tr.delete(imageSelection.position, imageSelection.position + node.nodeSize),
    );
    setImageSelection(null);
  }

  function saveFormula() {
    const latex = formulaDraft.trim();
    if (!latex) return;
    if (formulaSelection) {
      const node = activeEditor.state.doc.nodeAt(formulaSelection.position);
      if (node?.type.name === "articleFormula") {
        activeEditor.view.dispatch(
          activeEditor.state.tr.setNodeMarkup(formulaSelection.position, undefined, { ...node.attrs, latex }),
        );
        setFormulaSelection({ ...formulaSelection, latex });
      }
    } else {
      activeEditor.chain().focus().insertContent({ type: "articleFormula", attrs: { latex } }).run();
    }
    setFormulaDraft("");
    setFormulaSelection(null);
    setFormulaComposerOpen(false);
  }

  function removeSelectedFormula() {
    if (!formulaSelection) return;
    const node = activeEditor.state.doc.nodeAt(formulaSelection.position);
    if (node?.type.name !== "articleFormula") {
      setFormulaSelection(null);
      setFormulaComposerOpen(false);
      setFormulaDraft("");
      return;
    }
    activeEditor.view.dispatch(
      activeEditor.state.tr.delete(formulaSelection.position, formulaSelection.position + node.nodeSize),
    );
    setFormulaSelection(null);
    setFormulaComposerOpen(false);
    setFormulaDraft("");
    activeEditor.commands.focus();
  }

  function openInternalLinkPicker() {
    setInternalLinkNotice("");
    const linked = selectionHasLink(activeEditor);
    if (linked) activeEditor.chain().focus().extendMarkRange("link").run();
    const { from, to, empty } = activeEditor.state.selection;
    if (empty) {
      setInternalLinkOpen(false);
      setInternalLinkSelection(null);
      setInternalLinkNotice("Selecione no texto a palavra, expressão ou trecho que receberá o link.");
      return;
    }
    const currentHref = linked ? String(activeEditor.getAttributes("link").href || "") : "";
    const currentSlug = currentHref.match(/^\/blog\/([^?#/]+)$/)?.[1];
    const currentArticle = currentSlug
      ? publishedArticles.find((article) => article.slug === decodeURIComponent(currentSlug))
      : undefined;
    setInternalLinkSelection({ from, to, linked });
    setInternalLinkQuery(currentArticle?.title || "");
    setInternalLinkOpen(true);
  }

  function setInternalArticleLink(article: LinkableArticle) {
    if (!internalLinkSelection) return;
    activeEditor
      .chain()
      .focus()
      .setTextSelection({ from: internalLinkSelection.from, to: internalLinkSelection.to })
      .unsetLink()
      .setLink({
        href: `/blog/${article.slug}`,
        target: "_blank",
        rel: "noopener noreferrer",
      })
      .run();
    setInternalLinkOpen(false);
    setInternalLinkSelection(null);
    setInternalLinkQuery("");
    setLinkActive(true);
    setInternalLinkNotice(`Link inserido para “${article.title}”.`);
  }

  function removeInternalArticleLink() {
    if (!internalLinkSelection) return;
    activeEditor
      .chain()
      .focus()
      .setTextSelection({ from: internalLinkSelection.from, to: internalLinkSelection.to })
      .unsetLink()
      .run();
    setInternalLinkOpen(false);
    setInternalLinkSelection(null);
    setInternalLinkQuery("");
    setLinkActive(false);
    setInternalLinkNotice("Link interno removido.");
  }

  function removeActiveInternalLink() {
    if (!selectionHasLink(activeEditor)) return;
    activeEditor.chain().focus().extendMarkRange("link").unsetLink().run();
    setInternalLinkOpen(false);
    setInternalLinkSelection(null);
    setInternalLinkQuery("");
    setLinkActive(false);
    setInternalLinkNotice("Link interno removido.");
  }

  async function saveImageFile(file: File) {
    const formData = new FormData();
    formData.set("image", file);
    const response = await fetch("/api/uploads/images", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Não foi possível enviar a imagem.");
    return {
      url: String(data.url || ""),
      mobileUrl: String(data.mobileUrl || ""),
      width: Number(data.width || 0),
      height: Number(data.height || 0),
      mobileWidth: Number(data.mobileWidth || 0),
      mobileHeight: Number(data.mobileHeight || 0),
    } satisfies UploadedImage;
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setUploadError("");
    setUploadNotice("");
    try {
      let sourceFile = file;
      let marginsAdjusted = false;
      try {
        const trimmedFile = await cropEmptyImageMargins(file);
        if (trimmedFile) {
          sourceFile = trimmedFile;
          marginsAdjusted = true;
        }
      } catch {
        sourceFile = file;
      }
      const uploaded = await saveImageFile(sourceFile);
      activeEditor.chain().focus().insertContent({
        type: "articleImage",
        attrs: {
          src: uploaded.url,
          mobileSrc: uploaded.mobileUrl,
          imageWidth: uploaded.width,
          imageHeight: uploaded.height,
          originalSrc: uploaded.url,
          trimmedSrc: "",
          alt: file.name.replace(/\.[^.]+$/, "").replaceAll("-", " "),
          caption: "",
          width: "100",
          align: "center",
          display: "standard",
          fit: "contain",
          zoom: false,
          border: false,
        },
      }).run();
      setUploadNotice(marginsAdjusted
        ? "Imagem ajustada e inserida em duas versões WebP: principal e celular."
        : "Imagem inserida em duas versões WebP compactadas: principal e celular.");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Não foi possível enviar a imagem.");
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  async function adjustSelectedImageMargins() {
    if (!imageSelection || imageAdjusting) return;
    setImageAdjusting(true);
    setUploadError("");
    setUploadNotice("");
    try {
      const response = await fetch(imageSelection.src);
      if (!response.ok) throw new Error("Não foi possível recuperar a imagem original.");
      const blob = await response.blob();
      const extension = blob.type === "image/jpeg" ? "jpg" : blob.type.split("/")[1] || "png";
      const sourceFile = new File([blob], `imagem-original.${extension}`, { type: blob.type || "image/png" });
      const trimmedFile = await cropEmptyImageMargins(sourceFile);
      if (!trimmedFile) {
        setUploadNotice("Não foram detectadas margens vazias relevantes nessa imagem.");
        return;
      }
      const uploaded = await saveImageFile(trimmedFile);
      updateSelectedImage({
        src: uploaded.url,
        mobileSrc: uploaded.mobileUrl,
        imageWidth: uploaded.width,
        imageHeight: uploaded.height,
        originalSrc: uploaded.url,
        trimmedSrc: "",
        fit: "contain",
      });
      setUploadNotice("Margens vazias ajustadas e as duas versões WebP foram substituídas no artigo.");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Não foi possível ajustar as margens da imagem.");
    } finally {
      setImageAdjusting(false);
    }
  }

  return (
    <div className="rich-editor">
      <div className="editor-sticky-controls">
      <div className="editor-toolbar" role="toolbar" aria-label="Formatação do artigo">
        {command("Intertítulo nível 1", activeEditor.isActive("heading", { level: 2 }), () => activeEditor.chain().focus().toggleHeading({ level: 2 }).run())}
        {command("Intertítulo nível 2", activeEditor.isActive("heading", { level: 3 }), () => activeEditor.chain().focus().toggleHeading({ level: 3 }).run())}
        {command("Intertítulo nível 3", activeEditor.isActive("heading", { level: 4 }), () => activeEditor.chain().focus().toggleHeading({ level: 4 }).run())}
        {command("Negrito", activeEditor.isActive("bold"), () => activeEditor.chain().focus().toggleBold().run())}
        {command("Itálico", activeEditor.isActive("italic"), () => activeEditor.chain().focus().toggleItalic().run())}
        {command("Sublinhado", activeEditor.isActive("underline"), () => activeEditor.chain().focus().toggleUnderline().run())}
        {command("Lista", activeEditor.isActive("bulletList"), () => activeEditor.chain().focus().toggleBulletList().run())}
        {command("Lista numerada", activeEditor.isActive("orderedList"), () => activeEditor.chain().focus().toggleOrderedList().run())}
        {command("Citação", activeEditor.isActive("blockquote"), () => activeEditor.chain().focus().toggleBlockquote().run())}
        <button
          type="button"
          className={linkActive ? "is-active" : ""}
          aria-pressed={linkActive}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openInternalLinkPicker}
        >
          {linkActive ? "Editar link interno" : "Inserir link interno"}
        </button>
        <button
          type="button"
          className="remove-link-button"
          disabled={!linkActive}
          onMouseDown={(event) => event.preventDefault()}
          onClick={removeActiveInternalLink}
          title={linkActive ? "Retirar o vínculo do trecho selecionado" : "Posicione o cursor sobre um link para removê-lo"}
        >
          Remover link
        </button>
        <button type="button" onClick={() => activeEditor.chain().focus().insertContent({ type: "tableOfContents" }).run()}>Inserir sumário</button>
        <button
          type="button"
          onClick={() => {
            setFormulaSelection(null);
            setFormulaDraft("");
            setFormulaComposerOpen(true);
          }}
        >
          Inserir fórmula LaTeX
        </button>
        <button type="button" disabled={uploading} onClick={() => imageInput.current?.click()}>{uploading ? "Enviando…" : "Inserir imagem"}</button>
        <input
          ref={imageInput}
          className="sr-only"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadImage(file);
          }}
        />
        {imageSelection && <>
          <button type="button" onClick={() => updateSelectedImage({ width: "50" })}>Imagem 50%</button>
          <button type="button" onClick={() => updateSelectedImage({ width: "75" })}>Imagem 75%</button>
          <button type="button" onClick={() => updateSelectedImage({ width: "100" })}>Imagem 100%</button>
        </>}
        <button type="button" className="footnote-button" onClick={addFootnote}>Inserir nota de rodapé</button>
      </div>
      {uploadError && <p className="editor-error" role="alert">{uploadError}</p>}
      {uploadNotice && <p className="editor-success" aria-live="polite">{uploadNotice}</p>}
      {internalLinkNotice && <p className="editor-success" aria-live="polite">{internalLinkNotice}</p>}
      {internalLinkOpen && internalLinkSelection && (
        <div className="editor-internal-link-settings" aria-label="Inserção de link para outro artigo">
          <div>
            <strong>{internalLinkSelection.linked ? "Editar link interno" : "Vincular trecho selecionado"}</strong>
            <p>Pesquise e escolha um artigo já publicado.</p>
          </div>
          <label>
            Pesquisar pelo título
            <input
              autoFocus
              type="search"
              value={internalLinkQuery}
              onChange={(event) => setInternalLinkQuery(event.target.value)}
              placeholder="Digite parte do título"
            />
          </label>
          <div className="internal-link-results" role="listbox" aria-label="Artigos publicados">
            {publishedArticles
              .filter((article) => !internalLinkQuery || normalizeSearch(article.title).includes(normalizeSearch(internalLinkQuery)))
              .map((article) => (
                <button
                  key={article.slug}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => setInternalArticleLink(article)}
                >
                  <span>{article.title}</span>
                  <small>/blog/{article.slug}</small>
                </button>
              ))}
            {!publishedArticles.some((article) =>
              !internalLinkQuery || normalizeSearch(article.title).includes(normalizeSearch(internalLinkQuery))
            ) && <p>Nenhum artigo publicado encontrado.</p>}
          </div>
          <div className="internal-link-actions">
            {internalLinkSelection.linked && (
              <button className="danger-action" type="button" onClick={removeInternalArticleLink}>Remover link</button>
            )}
            <button
              type="button"
              onClick={() => {
                setInternalLinkOpen(false);
                setInternalLinkSelection(null);
                setInternalLinkQuery("");
                activeEditor.commands.focus();
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {imageSelection && (
        <div className="editor-image-settings" aria-label="Configurações da imagem selecionada">
          <label>
            Descrição da imagem
            <input
              value={imageSelection.alt}
              onChange={(event) => updateSelectedImage({ alt: event.target.value })}
            />
          </label>
          <label>
            Legenda
            <input
              value={imageSelection.caption}
              placeholder="Opcional"
              onChange={(event) => updateSelectedImage({ caption: event.target.value })}
            />
          </label>
          <div className="editor-image-presentation">
            <strong>Leitura da imagem</strong>
            <div>
              <button
                type="button"
                disabled={imageAdjusting}
                onClick={() => void adjustSelectedImageMargins()}
              >
                {imageAdjusting ? "Analisando margens…" : "Ajustar margens automaticamente"}
              </button>
              <button
                type="button"
                className={imageSelection.zoom ? "is-active" : ""}
                aria-pressed={imageSelection.zoom}
                onClick={() => updateSelectedImage({ zoom: !imageSelection.zoom })}
              >
                {imageSelection.zoom ? "Ampliação ativada" : "Permitir ampliação"}
              </button>
              <button
                type="button"
                className={imageSelection.border ? "is-active" : ""}
                aria-pressed={imageSelection.border}
                onClick={() => updateSelectedImage({ border: !imageSelection.border })}
              >
                {imageSelection.border ? "Borda do site ativada" : "Adicionar borda do site"}
              </button>
            </div>
            <small>O ajuste localiza o conteúdo visível e preserva uma margem de segurança. Cada envio grava somente duas versões WebP compactadas, principal e celular; o arquivo bruto não é mantido. A borda do site é independente da moldura existente no arquivo.</small>
          </div>
          <button type="button" onClick={removeSelectedImage}>Remover imagem</button>
        </div>
      )}
      {formulaComposerOpen && (
        <div className="editor-formula-settings" aria-label="Editor de fórmula LaTeX">
          <label>
            Fórmula em LaTeX
            <textarea
              value={formulaDraft}
              onChange={(event) => setFormulaDraft(event.target.value)}
              rows={2}
              placeholder="\frac{a}{b} ou E = mc^2"
            />
          </label>
          <div>
            <button type="button" onClick={saveFormula}>{formulaSelection ? "Atualizar fórmula" : "Inserir fórmula"}</button>
            {formulaSelection && <button className="formula-remove-button" type="button" onClick={removeSelectedFormula}>Remover fórmula</button>}
            <button
              type="button"
              onClick={() => {
                setFormulaComposerOpen(false);
                setFormulaSelection(null);
                setFormulaDraft("");
              }}
            >
              Cancelar
            </button>
          </div>
          <div className="formula-live-preview" aria-live="polite">
            <span>Prévia</span>
            {formulaDraft.trim()
              ? <div dangerouslySetInnerHTML={{ __html: renderLatex(formulaDraft) }} />
              : <p>Digite a fórmula para visualizar o resultado.</p>}
          </div>
        </div>
      )}
      </div>
      <EditorContent editor={activeEditor} />
      <details
        ref={notesDetails}
        className="editor-footnotes"
        open={notesOpen}
        onToggle={(event) => setNotesOpen(event.currentTarget.open)}
      >
        <summary>
          <span>Notas de rodapé</span>
          <small>
            {footnotes.length
              ? `${footnotes.length} cadastrada${footnotes.length === 1 ? "" : "s"}`
              : "Nenhuma cadastrada"}
          </small>
          {footnotes.some((item) => footnoteIsIncomplete(item, footnotes)) && (
            <em>Há nota incompleta</em>
          )}
        </summary>
        <div className="editor-footnotes-body">
          <div>
            <h3 id="editor-footnotes-title">Notas de rodapé</h3>
            <p>Posicione o cursor no texto, insira a nota e formate-a abaixo.</p>
          </div>
          {!footnotes.length && <p className="empty-footnotes">Nenhuma nota inserida.</p>}
          <ol>
            {footnotes.map((item, index) => {
              const referenceCount = item.segments.filter((segment) => segment.type === "reference").length;
              const incomplete = footnoteIsIncomplete(item, footnotes);
              return (
              <li
                id={`editor-footnote-${item.id}`}
                className={newFootnoteId === item.id ? "is-new-footnote" : ""}
                key={item.id}
              >
                <details
                  className="footnote-item"
                  open={openFootnoteIds.has(item.id)}
                  onToggle={(event) => {
                    const open = event.currentTarget.open;
                    setOpenFootnoteIds((current) => {
                      const isTracked = current.has(item.id);
                      if (isTracked === open) return current;
                      const next = new Set(current);
                      if (open) next.add(item.id);
                      else next.delete(item.id);
                      return next;
                    });
                  }}
                >
                  <summary>
                    <strong>Nota {index + 1}</strong>
                    <span>
                      {referenceCount
                        ? `${referenceCount} referência${referenceCount === 1 ? "" : "s"}`
                        : "Sem referência"}
                    </span>
                    <small>{shortenedFootnotePreview(item, bibliographicReferences)}</small>
                    {incomplete && <em>Incompleta</em>}
                  </summary>
                  <div className="footnote-item-body">
                  <div className="footnote-composer">
                    <p className="footnote-composer-help">
                      Monte a nota na ordem em que ela será lida. Os textos pertencem apenas a esta nota; as referências permanecem vinculadas ao cadastro central.
                    </p>
                    <div className="footnote-segments">
                      {item.segments.map((segment, segmentIndex) => (
                        <section className={`footnote-segment is-${segment.type}`} key={segment.id}>
                          <header>
                            <strong>
                              {segment.type === "text"
                                ? `Texto variável ${item.segments.slice(0, segmentIndex + 1).filter((part) => part.type === "text").length}`
                                : `${segment.presentation === "full" ? "Referência" : "Referência abreviada"} ${item.segments.slice(0, segmentIndex + 1).filter((part) => part.type === "reference").length}`}
                            </strong>
                            <span>
                              <button
                                type="button"
                                disabled={segmentIndex === 0}
                                aria-label="Mover este bloco para cima"
                                onClick={() => {
                                  const next = [...item.segments];
                                  [next[segmentIndex - 1], next[segmentIndex]] = [next[segmentIndex], next[segmentIndex - 1]];
                                  updateFootnoteSegments(item, next);
                                }}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={segmentIndex === item.segments.length - 1}
                                aria-label="Mover este bloco para baixo"
                                onClick={() => {
                                  const next = [...item.segments];
                                  [next[segmentIndex], next[segmentIndex + 1]] = [next[segmentIndex + 1], next[segmentIndex]];
                                  updateFootnoteSegments(item, next);
                                }}
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                className="remove-footnote-segment"
                                aria-label="Remover este bloco da nota"
                                onClick={() => updateFootnoteSegments(
                                  item,
                                  item.segments.filter((part) => part.id !== segment.id),
                                )}
                              >
                                Remover
                              </button>
                            </span>
                          </header>
                          {segment.type === "text" ? (
                            <FootnoteTextEditor
                              number={item.number}
                              value={segment.html}
                              publishedArticles={publishedArticles}
                              onChange={(html) => updateFootnoteSegments(
                                item,
                                item.segments.map((part) => part.id === segment.id && part.type === "text"
                                  ? { ...part, html }
                                  : part),
                              )}
                            />
                          ) : (
                            <FootnoteBibliographyEditor
                              noteNumber={item.number}
                              segment={segment}
                              previousReferenceId={previousFootnoteReferenceId(footnotes, item.id, segmentIndex)}
                              references={bibliographicReferences}
                              onChange={(nextSegment) => updateFootnoteSegments(
                                item,
                                item.segments.map((part) => part.id === segment.id && part.type === "reference"
                                  ? nextSegment
                                  : part),
                              )}
                              onInsertFichamentoText={(text) => {
                                const next = [...item.segments];
                                next.splice(segmentIndex, 0, {
                                  id: crypto.randomUUID(),
                                  type: "text",
                                  html: escapeHtml(text).replace(/\r?\n/g, "<br>"),
                                });
                                updateFootnoteSegments(item, next);
                              }}
                              onReferenceCreated={(reference) => onReferenceCreated?.(reference)}
                              onReferencesLoaded={onReferencesLoaded}
                            />
                          )}
                        </section>
                      ))}
                    </div>
                    <div className="footnote-add-segment">
                      <button
                        type="button"
                        onClick={() => updateFootnoteSegments(item, [...item.segments, newFootnoteSegment("text")])}
                      >
                        + Adicionar texto
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFootnoteSegments(item, [...item.segments, newFootnoteSegment("reference")])}
                      >
                        + Adicionar referência
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFootnoteSegments(item, [
                          ...item.segments,
                          newFootnoteSegment("reference", {
                            presentation: "ibid",
                            referenceId: previousFootnoteReferenceId(footnotes, item.id, item.segments.length),
                          }),
                        ])}
                      >
                        + Adicionar referência abreviada
                      </button>
                    </div>
                    <div className="footnote-composer-preview">
                      <strong>Prévia da nota</strong>
                      <p>{footnotePreviewText(item.segments, bibliographicReferences) || "A nota ainda está vazia."}</p>
                    </div>
                  </div>
                    <button className="footnote-remove" type="button" onClick={() => removeFootnote(item)}>
                      Remover nota
                    </button>
                  </div>
                </details>
              </li>
              );
            })}
          </ol>
        </div>
      </details>
    </div>
  );
}
