import "server-only";

import { strToU8, zipSync } from "fflate";
import { parseDocument } from "htmlparser2";
import type { AnyNode, Element, Text } from "domhandler";
import { getStorage } from "./storage";
import {
  decodeFootnoteSegments,
  normalizedReferenceLocation,
  removeTerminalReferencePeriod,
  replacesTerminalReferencePeriod,
} from "./footnote-segments";

export type WordExportArticle = {
  title: string;
  slug: string;
  contentHtml: string;
  summary?: string;
  youtubeUrl?: string;
  authors: string[];
  category?: string;
  tags: { name: string }[];
  bibliographicReferences?: WordExportReference[];
  publishedAt: string | null;
  updatedAt: string;
};

export type WordExportReference = {
  id: string;
  referenceText: string;
  referenceHtml: string;
};

export type WordExportFichamento = {
  literalQuote: string;
  paraphrase: string;
  location: string;
  personalNote: string;
  topics: Array<{ id: string; name: string }>;
};

export type WordExportReferenceWithFichamentos = WordExportReference & {
  fichamentos: WordExportFichamento[];
};

function plainFichamentoPersonalNote(value: string) {
  return value.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2");
}

type Formatting = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  superscript?: boolean;
  subscript?: boolean;
};

type Relationship = {
  id: string;
  type: string;
  target: string;
  targetMode?: "External";
};

type Media = {
  name: string;
  contentType: string;
  data: Uint8Array;
};

const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument";
const IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const HYPERLINK_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
const FOOTNOTES_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes";
const STYLES_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles";
const NUMBERING_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering";
const CORE_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties";
const APP_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties";
const MAX_EXPORT_IMAGE_SIZE = 8 * 1024 * 1024;

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function htmlText(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function isElement(node: AnyNode): node is Element {
  return node.type === "tag";
}

function isText(node: AnyNode): node is Text {
  return node.type === "text";
}

function childNodes(node: AnyNode) {
  return "children" in node ? node.children : [];
}

function textContent(node: AnyNode): string {
  if (isText(node)) return node.data;
  return childNodes(node).map(textContent).join("");
}

function hasClass(element: Element, className: string) {
  return (element.attribs.class || "").split(/\s+/).includes(className);
}

function findAll(nodes: AnyNode[], predicate: (node: AnyNode) => boolean, found: AnyNode[] = []) {
  for (const node of nodes) {
    if (predicate(node)) found.push(node);
    findAll(childNodes(node), predicate, found);
  }
  return found;
}

function runProperties(formatting: Formatting = {}, extra = "") {
  return `<w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Aptos"/>${formatting.bold ? "<w:b/>" : ""}${formatting.italic ? "<w:i/>" : ""}${formatting.underline ? '<w:u w:val="single"/>' : ""}${formatting.superscript ? '<w:vertAlign w:val="superscript"/>' : ""}${formatting.subscript ? '<w:vertAlign w:val="subscript"/>' : ""}${extra}</w:rPr>`;
}

function textRun(value: string, formatting: Formatting = {}, extra = "") {
  if (!value) return "";
  const preserve = /^\s|\s$|\s{2}/.test(value) ? ' xml:space="preserve"' : "";
  return `<w:r>${runProperties(formatting, extra)}<w:t${preserve}>${xml(value)}</w:t></w:r>`;
}

function breakRun() {
  return `<w:r><w:br/></w:r>`;
}

function paragraph(content: string, style = "Normal", properties = "") {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${properties}</w:pPr>${content || textRun(" ")}</w:p>`;
}

function safeDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function formatDate(value: string | null | undefined) {
  const date = safeDate(value);
  if (!date) return "Rascunho — sem data de publicação";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function exportDateParts(date: Date) {
  const timeZone = process.env.TZ || "America/Bahia";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, timeZone };
}

function formatExportDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: exportDateParts(date).timeZone,
  }).format(date);
}

function normalizeLink(href: string, siteUrl?: string) {
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith("/") && siteUrl) {
    try {
      return new URL(href, siteUrl).toString();
    } catch {
      return href;
    }
  }
  return href;
}

function extensionFromSource(source: string) {
  return source.match(/\.([a-z0-9]+)(?:[?#]|$)/i)?.[1]?.toLowerCase() || "";
}

function imageInfo(data: Uint8Array, extension: string) {
  if (extension === "png" && data.length >= 24) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20), contentType: "image/png" };
  }
  if ((extension === "jpg" || extension === "jpeg") && data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) { offset += 1; continue; }
      const marker = data[offset + 1];
      const length = (data[offset + 2] << 8) + data[offset + 3];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          width: (data[offset + 7] << 8) + data[offset + 8],
          height: (data[offset + 5] << 8) + data[offset + 6],
          contentType: "image/jpeg",
        };
      }
      if (!length) break;
      offset += length + 2;
    }
  }
  if (extension === "webp") return { width: 1200, height: 800, contentType: "image/webp" };
  return null;
}

function drawing(relationshipId: string, media: Media, widthPercent: number, imageNumber: number, alt: string) {
  const info = imageInfo(media.data, media.name.split(".").pop() || "");
  if (!info) return "";
  const maxWidth = Math.round(5.95 * 914400 * Math.min(1, Math.max(0.25, widthPercent / 100)));
  const ratio = info.height > 0 ? info.width / info.height : 1.5;
  const height = Math.round(Math.min(maxWidth / ratio, 7.6 * 914400));
  const width = Math.round(height * ratio);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${width}" cy="${height}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${imageNumber}" name="Imagem ${imageNumber}" descr="${xml(alt || `Imagem ${imageNumber}`)}"/><wp:cNvGraphicFramePr/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${xml(media.name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function latexToReadable(value: string) {
  let current = value.trim();
  const commands: Record<string, string> = {
    "\\times": "×", "\\cdot": "·", "\\div": "÷", "\\pm": "±", "\\leq": "≤", "\\geq": "≥",
    "\\neq": "≠", "\\approx": "≈", "\\infty": "∞", "\\sum": "∑", "\\prod": "∏", "\\int": "∫",
    "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ", "\\Delta": "Δ", "\\epsilon": "ε",
    "\\theta": "θ", "\\lambda": "λ", "\\mu": "μ", "\\pi": "π", "\\rho": "ρ", "\\sigma": "σ", "\\Sigma": "Σ", "\\omega": "ω",
  };
  current = current.replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");
  current = current.replace(/\\sqrt\s*\{([^{}]+)\}/g, "√($1)");
  for (const [command, replacement] of Object.entries(commands)) current = current.replaceAll(command, replacement);
  return current
    .replace(/\\(?:mathrm|mathbf|text|operatorname)\s*\{([^{}]+)\}/g, "$1")
    .replace(/\^\{([^{}]+)\}/g, "^($1)")
    .replace(/_\{([^{}]+)\}/g, "_($1)")
    .replace(/[{}]/g, "")
    .replace(/\\,/g, " ")
    .replace(/\\([a-zA-Z]+)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

class DocumentBuilder {
  readonly relationships: Relationship[] = [
    { id: "rId1", type: STYLES_REL, target: "styles.xml" },
    { id: "rId2", type: NUMBERING_REL, target: "numbering.xml" },
    { id: "rId3", type: FOOTNOTES_REL, target: "footnotes.xml" },
  ];
  readonly footnoteRelationships: Relationship[] = [];
  readonly media: Media[] = [];
  private relationshipNumber = 4;
  private footnoteRelationshipNumber = 1;
  private imageNumber = 1;
  private noteNumber = 1;
  private listLevel = 0;
  private notes = new Map<string, { number: number; html: string }>();
  private references = new Map<string, WordExportReference>();

  constructor(private readonly siteUrl?: string, references: WordExportReference[] = []) {
    this.references = new Map(references.map((reference) => [reference.id, reference]));
  }

  private relationship(type: string, target: string, targetMode?: "External") {
    const existing = this.relationships.find((item) => item.type === type && item.target === target && item.targetMode === targetMode);
    if (existing) return existing.id;
    const id = `rId${this.relationshipNumber++}`;
    this.relationships.push({ id, type, target, targetMode });
    return id;
  }

  private footnoteRelationship(type: string, target: string, targetMode?: "External") {
    const existing = this.footnoteRelationships.find((item) => item.type === type && item.target === target && item.targetMode === targetMode);
    if (existing) return existing.id;
    const id = `rId${this.footnoteRelationshipNumber++}`;
    this.footnoteRelationships.push({ id, type, target, targetMode });
    return id;
  }

  collectNotes(nodes: AnyNode[]) {
    const calls = findAll(nodes, (node) => isElement(node) && node.name === "sup" && node.attribs["data-footnote"] !== undefined);
    for (const call of calls) {
      if (!isElement(call)) continue;
      const id = call.attribs["data-footnote-id"] || String(this.noteNumber);
      if (this.notes.has(id)) continue;
      const explicitNumber = Number(call.attribs["data-footnote-number"]);
      const number = Number.isFinite(explicitNumber) && explicitNumber > 0 ? explicitNumber : this.noteNumber;
      const segments = decodeFootnoteSegments(call.attribs["data-footnote-segments"], {
        text: call.attribs["data-footnote-text"] || "",
        referenceId: call.attribs["data-footnote-reference-id"] || "",
        citationDetails: call.attribs["data-footnote-citation-details"] || "",
      });
      const parts = segments.flatMap<{ html: string; type: "text" | "reference" }>((segment) => {
        if (segment.type === "text") {
          return segment.html
            ? [{ html: segment.html, type: "text" as const }]
            : [];
        }
        const reference = this.references.get(segment.referenceId);
        if (!reference?.referenceHtml) return [];
        if (segment.presentation !== "full") {
          const label = segment.presentation === "ibid" ? "Ibid." : segment.presentation === "idem" ? "Id." : "op. cit.";
          const location = normalizedReferenceLocation(segment.location).replace(/[.\s]+$/, "");
          return [{
            html: `<em>${label}</em>${location ? `, ${htmlText(location)}.` : ""}`,
            type: "reference" as const,
          }];
        }
        const location = normalizedReferenceLocation(segment.location).replace(/[.\s]+$/, "");
        return [{
          html: location
            ? `${removeTerminalReferencePeriod(reference.referenceHtml)}, ${htmlText(location)}.`
            : reference.referenceHtml,
          type: "reference" as const,
        }];
      });
      const html = parts.reduce((result, part, index) => {
        if (!result) return part.html;
        const right = textContent(parseDocument(part.html)).trim();
        const normalizedResult = parts[index - 1]?.type === "reference" && replacesTerminalReferencePeriod(right)
          ? removeTerminalReferencePeriod(result)
          : result;
        const left = textContent(parseDocument(normalizedResult)).trim();
        const touchesPrevious = /[\s([{“‘"'—–/-]$/.test(left) || /^[\s,.;:!?)}\]”’]/.test(right);
        return `${normalizedResult}${touchesPrevious ? "" : " "}${part.html}`;
      }, "");
      this.notes.set(id, { number, html: html || `Nota ${number}.` });
      this.noteNumber = Math.max(this.noteNumber, number + 1);
    }
  }

  private hyperlink(content: string, href: string, inFootnote = false) {
    const target = normalizeLink(href, this.siteUrl);
    if (!/^(?:https?:|mailto:|\/)/i.test(target)) return content;
    const id = inFootnote
      ? this.footnoteRelationship(HYPERLINK_REL, target, "External")
      : this.relationship(HYPERLINK_REL, target, "External");
    return `<w:hyperlink r:id="${id}" w:history="1">${content.replace("<w:rPr>", '<w:rPr><w:color w:val="1259B2"/><w:u w:val="single"/>')}</w:hyperlink>`;
  }

  linkedText(label: string, href: string) {
    return this.hyperlink(textRun(label), href);
  }

  inline(nodes: AnyNode[], formatting: Formatting = {}, inFootnote = false): string {
    return nodes.map((node) => {
      if (isText(node)) return textRun(node.data, formatting);
      if (!isElement(node)) return this.inline(childNodes(node), formatting, inFootnote);
      if (node.name === "br") return breakRun();
      if (node.name === "sup" && node.attribs["data-footnote"] !== undefined) {
        const id = node.attribs["data-footnote-id"] || "";
        const note = this.notes.get(id);
        return note ? `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${note.number}"/></w:r>` : "";
      }
      const next = { ...formatting };
      if (node.name === "strong" || node.name === "b") next.bold = true;
      if (node.name === "em" || node.name === "i") next.italic = true;
      if (node.name === "u") next.underline = true;
      if (node.name === "sup") next.superscript = true;
      if (node.name === "sub") next.subscript = true;
      const content = this.inline(node.children, next, inFootnote);
      if (node.name === "a" && node.attribs.href) return this.hyperlink(content, node.attribs.href, inFootnote);
      return content;
    }).join("");
  }

  private async mediaFromImage(element: Element) {
    const source = element.attribs.src || "";
    const key = source.match(/^\/media\/([^?#]+)$/)?.[1];
    if (!key) return null;
    try {
      const decodedKey = decodeURIComponent(key);
      if (decodedKey.includes("/") || decodedKey.includes("\\")) return null;
      const data = await getStorage().readOriginal(decodedKey);
      if (!data.length || data.length > MAX_EXPORT_IMAGE_SIZE) return null;
      const extension = extensionFromSource(decodedKey);
      const info = imageInfo(data, extension);
      if (!info) return null;
      const media: Media = { name: `imagem-${this.imageNumber}.${extension}`, contentType: info.contentType, data };
      this.media.push(media);
      const relationshipId = this.relationship(IMAGE_REL, `media/${media.name}`);
      const imageNumber = this.imageNumber++;
      return { media, relationshipId, imageNumber };
    } catch {
      return null;
    }
  }

  private formula(element: Element) {
    const raw = element.attribs["data-latex"] || textContent(element);
    const readable = latexToReadable(raw) || raw;
    return `<m:oMathPara><m:oMath><m:r><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t>${xml(readable)}</m:t></m:r></m:oMath></m:oMathPara>`;
  }

  private async figure(element: Element) {
    const caption = element.children.find((node) => isElement(node) && node.name === "figcaption");
    const image = findAll(element.children, (node) => isElement(node) && node.name === "img").find(isElement);
    const output: string[] = [];
    if (caption) output.push(paragraph(this.inline(childNodes(caption)), "Caption"));
    if (!image || !isElement(image)) return output;
    const loaded = await this.mediaFromImage(image);
    if (!loaded) {
      output.push(paragraph(textRun(image.attribs.alt ? `[Imagem: ${image.attribs.alt}]` : "[Imagem indisponível no arquivo exportado]", { italic: true }), "Caption"));
      return output;
    }
    const width = Number(element.attribs["data-image-width"] || "100");
    output.push(paragraph(drawing(loaded.relationshipId, loaded.media, width, loaded.imageNumber, image.attribs.alt || ""), "Image", '<w:jc w:val="center"/><w:keepNext/>'));
    return output;
  }

  private async standaloneImage(element: Element) {
    const loaded = await this.mediaFromImage(element);
    if (!loaded) {
      return paragraph(textRun(element.attribs.alt ? `[Imagem: ${element.attribs.alt}]` : "[Imagem indisponível no arquivo exportado]", { italic: true }), "Caption");
    }
    return paragraph(
      drawing(loaded.relationshipId, loaded.media, 100, loaded.imageNumber, element.attribs.alt || ""),
      "Image",
      '<w:jc w:val="center"/>',
    );
  }

  private table(element: Element) {
    const caption = element.children.find((node) => isElement(node) && node.name === "caption");
    const rows = findAll(element.children, (node) => isElement(node) && node.name === "tr").filter(isElement);
    if (!rows.length) return caption ? [paragraph(this.inline(childNodes(caption)), "Caption")] : [];
    const cellsByRow = rows.map((row) => row.children.filter((node) => isElement(node) && (node.name === "th" || node.name === "td")).filter(isElement));
    const columnCount = Math.max(1, ...cellsByRow.map((cells) => cells.reduce((count, cell) => count + Math.max(1, Number(cell.attribs.colspan) || 1), 0)));
    const tableWidth = 9360;
    const baseWidth = Math.floor(tableWidth / columnCount);
    const widths = Array.from({ length: columnCount }, (_, index) => index === columnCount - 1 ? tableWidth - baseWidth * (columnCount - 1) : baseWidth);
    const tableRows = cellsByRow.map((cells, rowIndex) => {
      let columnIndex = 0;
      const tableCells = cells.map((cell) => {
        const span = Math.min(columnCount - columnIndex, Math.max(1, Number(cell.attribs.colspan) || 1));
        const width = widths.slice(columnIndex, columnIndex + span).reduce((sum, value) => sum + value, 0);
        columnIndex += span;
        const isHeader = cell.name === "th";
        const properties = `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}<w:vAlign w:val="center"/>${isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="E6EEF8"/>' : ""}</w:tcPr>`;
        return `<w:tc>${properties}${paragraph(this.inline(cell.children, isHeader ? { bold: true } : {}), "TableText")}</w:tc>`;
      }).join("");
      const headerRow = rowIndex === 0 && cells.some((cell) => cell.name === "th");
      return `<w:tr>${headerRow ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${tableCells}</w:tr>`;
    }).join("");
    const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C8D4E3"/>`)
      .join("");
    const tableXml = `<w:tbl><w:tblPr><w:tblW w:w="${tableWidth}" w:type="dxa"/><w:tblInd w:w="120" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${borders}</w:tblBorders><w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:start w:w="120" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:end w:w="120" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${tableRows}</w:tbl>`;
    return [...(caption ? [paragraph(this.inline(childNodes(caption)), "Caption")] : []), tableXml];
  }

  async blocks(nodes: AnyNode[], output: string[] = []): Promise<string[]> {
    for (const node of nodes) {
      if (isText(node)) {
        if (node.data.trim()) output.push(paragraph(textRun(node.data)));
        continue;
      }
      if (!isElement(node)) {
        await this.blocks(childNodes(node), output);
        continue;
      }
      if (node.name === "section" && hasClass(node, "footnotes")) continue;
      if (node.name === "nav" || node.attribs["data-article-toc"] !== undefined) continue;
      if (node.name === "figure" && node.attribs["data-article-image"] !== undefined) {
        output.push(...await this.figure(node));
        continue;
      }
      if (node.name === "img") {
        output.push(await this.standaloneImage(node));
        continue;
      }
      if (node.name === "table") {
        output.push(...this.table(node));
        continue;
      }
      if (node.name === "div" && node.attribs["data-article-formula"] !== undefined) {
        output.push(paragraph(this.formula(node), "Formula", '<w:jc w:val="center"/>'));
        continue;
      }
      if (node.name === "h1" || node.name === "h2" || node.name === "h3" || node.name === "h4") {
        const style = node.name === "h4" ? "Heading3" : node.name === "h3" ? "Heading2" : "Heading1";
        output.push(paragraph(this.inline(node.children), style, '<w:keepNext/><w:keepLines/>'));
        continue;
      }
      if (node.name === "p") {
        output.push(paragraph(this.inline(node.children)));
        continue;
      }
      if (node.name === "pre") {
        output.push(paragraph(textRun(textContent(node)), "CodeBlock"));
        continue;
      }
      if (node.name === "hr") {
        output.push(paragraph("", "Normal", '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="8" w:color="D4DEEB"/></w:pBdr>'));
        continue;
      }
      if (node.name === "blockquote") {
        output.push(paragraph(this.inline(node.children), "Quote", '<w:ind w:left="360"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="1259B2"/></w:pBdr>'));
        continue;
      }
      if (node.name === "ul" || node.name === "ol") {
        const previous = this.listLevel;
        this.listLevel = Math.min(1, previous);
        for (const item of node.children.filter((child) => isElement(child) && child.name === "li")) {
          if (!isElement(item)) continue;
          const blockNames = new Set(["ul", "ol", "figure", "table", "div", "pre"]);
          const inlineChildren = item.children.filter((child) => !(isElement(child) && blockNames.has(child.name)));
          const numId = node.name === "ol" ? 2 : 1;
          output.push(paragraph(this.inline(inlineChildren), "Normal", `<w:numPr><w:ilvl w:val="${this.listLevel}"/><w:numId w:val="${numId}"/></w:numPr>`));
          for (const nested of item.children.filter((child) => isElement(child) && blockNames.has(child.name))) {
            if (isElement(nested) && (nested.name === "ul" || nested.name === "ol")) this.listLevel = 1;
            await this.blocks([nested], output);
          }
        }
        this.listLevel = previous;
        continue;
      }
      await this.blocks(node.children, output);
    }
    return output;
  }

  footnotesXml() {
    const notes = Array.from(this.notes.entries()).sort((a, b) => a[1].number - b[1].number);
    const definitions = notes.map(([, note]) => {
      const fragment = parseDocument(note.html).children;
      const content = this.inline(fragment, {}, true);
      return `<w:footnote w:id="${note.number}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/><w:t xml:space="preserve"> </w:t></w:r>${content}</w:p></w:footnote>`;
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${REL}"><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${definitions}</w:footnotes>`;
  }
}

function relationshipsXml(relationships: Relationship[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.map((item) => `<Relationship Id="${item.id}" Type="${item.type}" Target="${xml(item.target)}"${item.targetMode ? ` TargetMode="${item.targetMode}"` : ""}/>`).join("")}</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Aptos"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:color w:val="062B70"/><w:sz w:val="40"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="80"/></w:pPr><w:rPr><w:color w:val="596477"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="160"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="062B70"/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1259B2"/><w:sz w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:color w:val="1259B2"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="100" w:after="140"/></w:pPr><w:rPr><w:color w:val="334158"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="80" w:after="80"/></w:pPr><w:rPr><w:i/><w:color w:val="596477"/><w:sz w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Image"><w:name w:val="Image"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="140"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Formula"><w:name w:val="Formula"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="120"/><w:shd w:val="clear" w:color="auto" w:fill="F3F6FA"/></w:pPr><w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Summary"><w:name w:val="Summary"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="100" w:after="220"/><w:ind w:left="240"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="1259B2"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="EDF4FD"/></w:pPr><w:rPr><w:color w:val="24334A"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="80" w:after="120"/><w:ind w:left="240" w:right="240"/><w:shd w:val="clear" w:color="auto" w:fill="F3F6FA"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="19"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style>
  <w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
  </w:styles>`;
}

function referenceStylesXml() {
  // Preset: compact_reference_guide. A bibliografia usa recuo francês e ritmo compacto.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:b/><w:color w:val="062B70"/><w:sz w:val="40"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="200"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:color w:val="596477"/><w:sz w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Bibliography"><w:name w:val="Bibliografia"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepLines/><w:spacing w:after="120" w:line="300" w:lineRule="auto"/><w:ind w:left="720" w:hanging="720"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:style>
  </w:styles>`;
}

function numberingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="360"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="–"/><w:pPr><w:ind w:left="1080" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="360"/></w:tabs><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2."/><w:pPr><w:ind w:left="1080" w:hanging="540"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;
}

function footerXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:color w:val="748095"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">Página </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:color w:val="748095"/><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
}

function contentTypes(media: Media[]) {
  const defaults = new Map([["rels", "application/vnd.openxmlformats-package.relationships+xml"], ["xml", "application/xml"]]);
  for (const item of media) defaults.set(item.name.split(".").pop() || "bin", item.contentType);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${Array.from(defaults).map(([extension, type]) => `<Default Extension="${extension}" ContentType="${type}"/>`).join("")}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
}

function encodeFiles(files: Record<string, string | Uint8Array>) {
  return Object.fromEntries(Object.entries(files).map(([name, value]) => [name, typeof value === "string" ? strToU8(value) : value]));
}

export function wordExportFilename(title: string, date = new Date()) {
  const safeTitle = title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100) || "artigo";
  return `${safeTitle}-${exportDateParts(date).iso}.docx`;
}

export function referencesExportFilename(date = new Date()) {
  return `referencias-bibliograficas-${exportDateParts(date).iso}.docx`;
}

export function referencesWithFichamentosExportFilename(date = new Date()) {
  return `referencias-e-fichamentos-${exportDateParts(date).iso}.docx`;
}

export async function generateArticleDocx(article: WordExportArticle, siteUrl?: string) {
  const parsed = parseDocument(article.contentHtml);
  const builder = new DocumentBuilder(siteUrl, article.bibliographicReferences);
  builder.collectNotes(parsed.children);
  const articleBlocks = await builder.blocks(parsed.children);
  const publishedLabel = formatDate(article.publishedAt);
  const exportedLabel = formatExportDate(new Date());
  const authors = article.authors.filter(Boolean).join("; ") || "Autoria não informada";
  const tags = article.tags.map((tag) => tag.name).filter(Boolean).join(" · ") || "Sem tags";
  const summary = article.summary?.trim();
  const body = [
    paragraph(textRun("ACADEMIA JURÍDICO-CONTÁBIL", { bold: true }, '<w:color w:val="1259B2"/><w:sz w:val="18"/>'), "Subtitle"),
    paragraph(textRun(article.title), "Title"),
    paragraph(textRun(`Autoria: ${authors}`, { bold: true }), "Subtitle"),
    paragraph(textRun(`Publicação: ${publishedLabel}  |  Exportação: ${exportedLabel}`), "Subtitle"),
    paragraph(textRun(`Tags: ${tags}`), "Subtitle", '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="8" w:color="D4DEEB"/></w:pBdr>'),
    ...(summary ? [paragraph(`${textRun("Resumo. ", { bold: true })}${textRun(summary)}`, "Summary")] : []),
    ...articleBlocks,
    ...(article.youtubeUrl?.trim()
      ? [
          paragraph(textRun("Vídeo explicativo", { bold: true }), "Heading2", '<w:keepNext/>'),
          paragraph(builder.linkedText("Assistir ao vídeo no YouTube", article.youtubeUrl)),
        ]
      : []),
    `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`,
  ].join("");
  builder.relationships.push({ id: "rIdFooter", type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer", target: "footer1.xml" });
  const now = new Date().toISOString();
  const files: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": contentTypes(builder.media),
    "_rels/.rels": relationshipsXml([
      { id: "rId1", type: OFFICE_REL, target: "word/document.xml" },
      { id: "rId2", type: CORE_REL, target: "docProps/core.xml" },
      { id: "rId3", type: APP_REL, target: "docProps/app.xml" },
    ]),
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${REL}" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body>${body}</w:body></w:document>`,
    "word/styles.xml": stylesXml(),
    "word/numbering.xml": numberingXml(),
    "word/footnotes.xml": builder.footnotesXml(),
    "word/footer1.xml": footerXml(),
    "word/_rels/document.xml.rels": relationshipsXml(builder.relationships),
    "word/_rels/footnotes.xml.rels": relationshipsXml(builder.footnoteRelationships),
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(article.title)}</dc:title><dc:creator>${xml(authors)}</dc:creator><cp:lastModifiedBy>Academia Jurídico-Contábil</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Academia Jurídico-Contábil</Application></Properties>`,
  };
  for (const media of builder.media) files[`word/media/${media.name}`] = media.data;
  return Buffer.from(zipSync(encodeFiles(files), { level: 6 }));
}

export function generateReferencesDocx(references: WordExportReference[], siteUrl?: string) {
  const builder = new DocumentBuilder(siteUrl);
  const ordered = references
    .slice()
    .sort((left, right) => left.referenceText.localeCompare(right.referenceText, "pt-BR"));
  const referenceParagraphs = ordered.length
    ? ordered.map((reference) => {
      const parsed = parseDocument(reference.referenceHtml);
      return paragraph(builder.inline(parsed.children), "Bibliography", '<w:keepLines/>');
    })
    : [paragraph(textRun("Nenhuma referência bibliográfica cadastrada.", { italic: true }), "Normal")];
  const exportedLabel = formatExportDate(new Date());
  const body = [
    paragraph(textRun("ACADEMIA JURÍDICO-CONTÁBIL", { bold: true }, '<w:color w:val="1259B2"/><w:sz w:val="18"/>'), "Subtitle"),
    paragraph(textRun("Referências bibliográficas"), "Title"),
    paragraph(
      textRun(`${ordered.length} ${ordered.length === 1 ? "referência" : "referências"} · Exportado em ${exportedLabel}`),
      "Subtitle",
      '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="8" w:color="D4DEEB"/></w:pBdr>',
    ),
    ...referenceParagraphs,
    `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`,
  ].join("");
  builder.relationships.push({
    id: "rIdFooter",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
    target: "footer1.xml",
  });
  const now = new Date().toISOString();
  const files: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": contentTypes([]),
    "_rels/.rels": relationshipsXml([
      { id: "rId1", type: OFFICE_REL, target: "word/document.xml" },
      { id: "rId2", type: CORE_REL, target: "docProps/core.xml" },
      { id: "rId3", type: APP_REL, target: "docProps/app.xml" },
    ]),
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${REL}"><w:body>${body}</w:body></w:document>`,
    "word/styles.xml": referenceStylesXml(),
    "word/numbering.xml": numberingXml(),
    "word/footnotes.xml": builder.footnotesXml(),
    "word/footer1.xml": footerXml(),
    "word/_rels/document.xml.rels": relationshipsXml(builder.relationships),
    "word/_rels/footnotes.xml.rels": relationshipsXml([]),
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Referências bibliográficas</dc:title><dc:creator>Academia Jurídico-Contábil</dc:creator><cp:lastModifiedBy>Academia Jurídico-Contábil</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Academia Jurídico-Contábil</Application></Properties>`,
  };
  return Buffer.from(zipSync(encodeFiles(files), { level: 6 }));
}

export function generateReferencesWithFichamentosDocx(
  references: WordExportReferenceWithFichamentos[],
  siteUrl?: string,
) {
  const builder = new DocumentBuilder(siteUrl);
  const ordered = references
    .slice()
    .sort((left, right) => left.referenceText.localeCompare(right.referenceText, "pt-BR"));
  const content = ordered.length
    ? ordered.flatMap((reference) => {
      const parsed = parseDocument(reference.referenceHtml);
      const blocks = [
        paragraph(
          builder.inline(parsed.children),
          "Bibliography",
          '<w:keepNext/><w:keepLines/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="6" w:color="D4DEEB"/></w:pBdr>',
        ),
      ];
      if (!reference.fichamentos.length) {
        blocks.push(paragraph(textRun("Sem registros no fichamento.", { italic: true }), "Normal", '<w:ind w:left="360"/>'));
        return blocks;
      }
      for (const [index, item] of reference.fichamentos.entries()) {
        const location = item.location ? ` · ${item.location}` : "";
        blocks.push(paragraph(
          textRun(`${index + 1}. Fichamento${location}`, { bold: true }),
          "Normal",
          '<w:keepNext/><w:spacing w:before="160" w:after="60"/>',
        ));
        if (item.topics.length) {
          blocks.push(paragraph(
            textRun(`Temas: ${item.topics.map((topic) => topic.name).join(" · ")}`),
            "Subtitle",
            '<w:keepNext/><w:spacing w:after="60"/>',
          ));
        }
        if (item.literalQuote) {
          blocks.push(paragraph(
            textRun("Citação literal", { bold: true }),
            "Subtitle",
            '<w:keepNext/><w:ind w:left="360" w:right="240"/><w:spacing w:after="40"/>',
          ));
          blocks.push(paragraph(
            textRun(item.literalQuote),
            "Normal",
            '<w:ind w:left="360" w:right="240"/><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="1259B2"/></w:pBdr>',
          ));
        }
        if (item.paraphrase) {
          blocks.push(paragraph(
            textRun("Síntese ou paráfrase", { bold: true }),
            "Subtitle",
            '<w:keepNext/><w:ind w:left="360" w:right="240"/><w:spacing w:after="40"/>',
          ));
          blocks.push(paragraph(
            textRun(item.paraphrase),
            "Normal",
            '<w:ind w:left="360" w:right="240"/>',
          ));
        }
        if (item.personalNote) {
          blocks.push(paragraph(
            textRun(`Observação pessoal: ${plainFichamentoPersonalNote(item.personalNote)}`),
            "Normal",
            '<w:ind w:left="360" w:right="240"/><w:shd w:val="clear" w:color="auto" w:fill="F3F6FA"/>',
          ));
        }
      }
      return blocks;
    })
    : [paragraph(textRun("Nenhuma referência bibliográfica cadastrada.", { italic: true }), "Normal")];
  const exportedLabel = formatExportDate(new Date());
  const fichamentoCount = ordered.reduce((total, reference) => total + reference.fichamentos.length, 0);
  const body = [
    paragraph(textRun("ACADEMIA JURÍDICO-CONTÁBIL", { bold: true }, '<w:color w:val="1259B2"/><w:sz w:val="18"/>'), "Subtitle"),
    paragraph(textRun("Referências e fichamentos"), "Title"),
    paragraph(
      textRun(`${ordered.length} ${ordered.length === 1 ? "referência" : "referências"} · ${fichamentoCount} ${fichamentoCount === 1 ? "registro" : "registros"} de fichamento · Exportado em ${exportedLabel}`),
      "Subtitle",
      '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="8" w:color="D4DEEB"/></w:pBdr>',
    ),
    ...content,
    `<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="360"/></w:sectPr>`,
  ].join("");
  builder.relationships.push({
    id: "rIdFooter",
    type: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer",
    target: "footer1.xml",
  });
  const now = new Date().toISOString();
  const files: Record<string, string | Uint8Array> = {
    "[Content_Types].xml": contentTypes([]),
    "_rels/.rels": relationshipsXml([
      { id: "rId1", type: OFFICE_REL, target: "word/document.xml" },
      { id: "rId2", type: CORE_REL, target: "docProps/core.xml" },
      { id: "rId3", type: APP_REL, target: "docProps/app.xml" },
    ]),
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${REL}"><w:body>${body}</w:body></w:document>`,
    "word/styles.xml": referenceStylesXml(),
    "word/numbering.xml": numberingXml(),
    "word/footnotes.xml": builder.footnotesXml(),
    "word/footer1.xml": footerXml(),
    "word/_rels/document.xml.rels": relationshipsXml(builder.relationships),
    "word/_rels/footnotes.xml.rels": relationshipsXml([]),
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Referências e fichamentos</dc:title><dc:creator>Academia Jurídico-Contábil</dc:creator><cp:lastModifiedBy>Academia Jurídico-Contábil</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`,
    "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Academia Jurídico-Contábil</Application></Properties>`,
  };
  return Buffer.from(zipSync(encodeFiles(files), { level: 6 }));
}
