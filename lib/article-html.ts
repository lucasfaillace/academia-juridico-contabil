import sanitizeHtml from "sanitize-html";
import { legacyReferenceHtml, sanitizeBibliographicReferenceHtml } from "./reference-html";
import katex from "katex";
import {
  decodeFootnoteSegments,
  normalizedReferenceLocation,
  removeTerminalReferencePeriod,
  replacesTerminalReferencePeriod,
  type FootnoteReferenceSegment,
} from "./footnote-segments";

type Heading = {
  id: string;
  level: 2 | 3 | 4;
  number: string;
  title: string;
};

function slugifyHeading(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "secao";
}

function decodeEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function attributeValue(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return decodeEntities(match?.[1] ?? match?.[2] ?? "");
}

function sanitizeFootnoteHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: ["strong", "b", "em", "i", "u", "a", "sup", "sub", "br"],
    allowedAttributes: { a: ["href", "title", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          ...attributes,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  }).trim();
}

function inlineReferenceHtml(value: string) {
  return sanitizeBibliographicReferenceHtml(value)
    .replace(/^\s*<p>/i, "")
    .replace(/<\/p>\s*$/i, "")
    .replace(/<\/p>\s*<p>/gi, "<br>");
}

function visibleText(value: string) {
  return decodeEntities(sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })).trim();
}

function renderedReferenceSegment(
  segment: FootnoteReferenceSegment,
  reference: { referenceText: string; referenceHtml: string },
) {
  if (segment.presentation !== "full") {
    const label = segment.presentation === "ibid" ? "Ibid." : segment.presentation === "idem" ? "Id." : "op. cit.";
    const location = normalizedReferenceLocation(segment.location).replace(/[.\s]+$/, "");
    return `<span class="footnote-bibliographic-reference is-abbreviated"><em>${label}</em>${location ? `, ${escapeHtml(location)}.` : ""}</span>`;
  }
  const referenceHtml = inlineReferenceHtml(reference.referenceHtml || legacyReferenceHtml(reference.referenceText));
  const location = normalizedReferenceLocation(segment.location).replace(/[.\s]+$/, "");
  if (!location) return `<span class="footnote-bibliographic-reference">${referenceHtml}</span>`;
  return `<span class="footnote-bibliographic-reference">${removeTerminalReferencePeriod(referenceHtml)}, ${escapeHtml(location)}.</span>`;
}

function joinFootnoteParts(parts: Array<{ html: string; type: "text" | "reference" }>) {
  return parts.reduce((result, part, index) => {
    if (!result) return part.html;
    const previous = parts[index - 1];
    const right = visibleText(part.html);
    const normalizedResult = previous?.type === "reference" && replacesTerminalReferencePeriod(right)
      ? removeTerminalReferencePeriod(result)
      : result;
    const left = visibleText(normalizedResult);
    const touchesPrevious = /[\s([{“‘"'—–/-]$/.test(left) || /^[\s,.;:!?)}\]”’]/.test(right);
    return `${normalizedResult}${touchesPrevious ? "" : " "}${part.html}`;
  }, "");
}

function renderFootnotes(
  source: string,
  references: Array<{ id: string; referenceText: string; referenceHtml: string }>,
) {
  const referenceById = new Map(references.map((reference) => [reference.id, reference]));
  const seen = new Set<string>();
  const notes = (source.match(/<sup\b[^>]*\bdata-footnote(?:=(?:""|'')|\s|>)[^>]*>/gi) || [])
    .map((tag, index) => ({
      id: attributeValue(tag, "data-footnote-id"),
      number: Number(attributeValue(tag, "data-footnote-number")) || index + 1,
      segments: decodeFootnoteSegments(attributeValue(tag, "data-footnote-segments"), {
        text: attributeValue(tag, "data-footnote-text"),
        referenceId: attributeValue(tag, "data-footnote-reference-id"),
        citationDetails: attributeValue(tag, "data-footnote-citation-details"),
      }),
    }))
    .filter((note) => {
      if (!note.id || seen.has(note.id)) return false;
      seen.add(note.id);
      return true;
    });

  if (!notes.length) return "";
  const items = notes.map((note) => {
    const parts = note.segments.flatMap<{ html: string; type: "text" | "reference" }>((segment) => {
      if (segment.type === "text") {
        const html = sanitizeFootnoteHtml(segment.html);
        return html ? [{ html, type: "text" as const }] : [];
      }
      const reference = referenceById.get(segment.referenceId);
      return reference
        ? [{
            html: renderedReferenceSegment(segment, reference),
            type: "reference" as const,
          }]
        : [];
    });
    const content = parts.length ? joinFootnoteParts(parts) : `Nota ${note.number} sem texto.`;
    return `<li id="nota-${escapeHtml(note.id)}">${content}</li>`;
  }).join("");
  return `<section class="footnotes" id="notas"><h2>Notas</h2><ol>${items}</ol></section>`;
}

function addFootnoteNumberLinks(value: string) {
  return value.replace(
    /<section([^>]*\bclass=(?:"[^"]*\bfootnotes\b[^"]*"|'[^']*\bfootnotes\b[^']*')[^>]*)>([\s\S]*?)<\/section>/gi,
    (_section, sectionAttributes: string, sectionContent: string) => {
      let number = 0;
      const content = sectionContent.replace(
        /<li([^>]*)>([\s\S]*?)<\/li>/gi,
        (_item, itemAttributes: string, itemContent: string) => {
          number += 1;
          const noteId = itemAttributes.match(/\bid=(?:"nota-([^"]+)"|'nota-([^']+)')/i)?.slice(1).find(Boolean);
          if (!noteId) return `<li${itemAttributes}>${itemContent}</li>`;

          const contentWithoutReturn = itemContent
            .replace(/<a[^>]*\bclass=(?:"[^"]*\bfootnote-number\b[^"]*"|'[^']*\bfootnote-number\b[^']*')[^>]*>[\s\S]*?<\/a>/i, "")
            .replace(/<span[^>]*\bclass=(?:"[^"]*\bfootnote-number\b[^"]*"|'[^']*\bfootnote-number\b[^']*')[^>]*>[\s\S]*?<\/span>/i, "")
            .replace(/\s*<a[^>]*\bclass=(?:"[^"]*\bfootnote-return\b[^"]*"|'[^']*\bfootnote-return\b[^']*')[^>]*>[\s\S]*?<\/a>\s*$/i, "")
            .replace(/\s*<a[^>]*\bhref=(?:"#[^"]*"|'#[^']*')[^>]*>\s*↩\s*<\/a>\s*$/i, "")
            .trim();
          return `<li${itemAttributes}><span class="footnote-number">${number}.</span><span>${contentWithoutReturn} <a class="footnote-return" href="#ref-${escapeHtml(noteId)}" aria-label="Voltar à chamada da nota ${number}">↩</a></span></li>`;
        },
      );
      const normalizedAttributes = /\bid=(?:"[^"]*"|'[^']*')/i.test(sectionAttributes)
        ? sectionAttributes
        : `${sectionAttributes} id="notas"`;
      return `<section${normalizedAttributes}>${content}</section>`;
    },
  );
}

function renderFormulas(value: string) {
  return value.replace(
    /<div([^>]*\bdata-article-formula(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*)>[\s\S]*?<\/div>/gi,
    (match, attributes: string) => {
      const encoded = attributes.match(/\bdata-latex=(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find((item) => item !== undefined) || "";
      const codeContent = match.match(/<code[^>]*>([\s\S]*?)<\/code>/i)?.[1] || "";
      const latex = decodeEntities(encoded || sanitizeHtml(codeContent, { allowedTags: [], allowedAttributes: {} }));
      if (!latex.trim()) return "";
      const rendered = katex.renderToString(latex, { displayMode: true, throwOnError: false, strict: false });
      return `<div class="article-formula" data-article-formula="" data-latex="${escapeHtml(latex)}" aria-label="Fórmula matemática">${rendered}</div>`;
    },
  );
}

export function prepareArticleHtml(source: string, options: {
  hasVideo?: boolean;
  hasComments?: boolean;
  references?: Array<{ id: string; referenceText: string; referenceHtml: string }>;
} = {}) {
  const headings: Heading[] = [];
  const usedIds = new Map<string, number>();
  const protectedFootnotes: string[] = [];
  let levelOne = 0;
  let levelTwo = 0;
  let levelThree = 0;
  const renderedFootnotes = renderFootnotes(source, options.references || []);
  const sourceWithoutGeneratedReferences = source.replace(
    /<section[^>]*\bclass=(?:"[^"]*\barticle-references\b[^"]*"|'[^']*\barticle-references\b[^']*')[^>]*>[\s\S]*?<\/section>/gi,
    "",
  );
  const sourceWithoutFootnotes = sourceWithoutGeneratedReferences.replace(
    /<section[^>]*\bclass=(?:"[^"]*\bfootnotes\b[^"]*"|'[^']*\bfootnotes\b[^']*')[^>]*>[\s\S]*?<\/section>/gi,
    (section) => {
      const index = protectedFootnotes.push(section) - 1;
      return `<div data-protected-footnotes="${index}"></div>`;
    },
  );
  const normalized = sourceWithoutFootnotes
    .replace(/<(\/?)h1(\s|>)/gi, "<$1h2$2");

  const withHeadingIds = normalized.replace(
    /<h([234])([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_match, rawLevel: string, rawAttributes: string, innerHtml: string) => {
      const level = Number(rawLevel) as 2 | 3 | 4;
      const contentWithoutNumber = innerHtml.replace(/^(\s*(?:<(?:strong|em|span)[^>]*>)*)\d+(?:\.\d+)*\.\s*/i, "$1");
      const titleWithoutNumber = decodeEntities(sanitizeHtml(contentWithoutNumber, { allowedTags: [], allowedAttributes: {} })).trim();
      if (!titleWithoutNumber) return "";
      if (level === 2) {
        levelOne += 1;
        levelTwo = 0;
        levelThree = 0;
      } else if (level === 3) {
        if (levelOne === 0) levelOne = 1;
        levelTwo += 1;
        levelThree = 0;
      } else {
        if (levelOne === 0) levelOne = 1;
        if (levelTwo === 0) levelTwo = 1;
        levelThree += 1;
      }
      const number = level === 2
        ? `${levelOne}.`
        : level === 3
          ? `${levelOne}.${levelTwo}.`
          : `${levelOne}.${levelTwo}.${levelThree}.`;

      const existingId = rawAttributes.match(/\sid=(?:"([^"]+)"|'([^']+)')/i)?.slice(1).find(Boolean);
      const baseId = existingId || slugifyHeading(titleWithoutNumber);
      const occurrence = usedIds.get(baseId) || 0;
      usedIds.set(baseId, occurrence + 1);
      const id = occurrence ? `${baseId}-${occurrence + 1}` : baseId;
      const attributesWithoutId = rawAttributes.replace(/\sid=(?:"[^"]*"|'[^']*')/gi, "");

      headings.push({ id, level, number, title: titleWithoutNumber });
      return `<h${level}${attributesWithoutId} id="${escapeHtml(id)}"><span class="heading-number">${number}</span> ${contentWithoutNumber}</h${level}>`;
    },
  );

  const toc = headings.length
    ? `<nav class="article-inline-toc" aria-label="Sumário do artigo"><p>Sumário</p><ul>${headings
        .map(({ id, level, number, title }) => `<li data-level="${level}"><a href="#${escapeHtml(id)}"><span class="toc-number">${escapeHtml(number)}</span><span class="toc-title">${escapeHtml(title)}</span></a></li>`)
        .join("")}${protectedFootnotes.length ? '<li data-level="2" class="toc-special"><a href="#notas"><span class="toc-title">Notas</span></a></li>' : ""}${options.hasVideo ? '<li data-level="2" class="toc-special"><a href="#video-explicativo"><span class="toc-title">Vídeo explicativo</span></a></li>' : ""}${options.hasComments ? '<li data-level="2" class="toc-special"><a href="#comentarios"><span class="toc-title">Comentários</span></a></li>' : ""}</ul></nav>`
    : "";

  const withTableOfContents = withHeadingIds.replace(
    /<div[^>]*data-article-toc(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?[^>]*>[\s\S]*?<\/div>/gi,
    toc,
  );
  const withFootnotes = withTableOfContents.replace(
    /<div data-protected-footnotes="(\d+)"><\/div>/g,
    (_match, index: string) => renderedFootnotes || protectedFootnotes[Number(index)] || "",
  );
  return renderFormulas(addFootnoteNumberLinks(withFootnotes));
}
