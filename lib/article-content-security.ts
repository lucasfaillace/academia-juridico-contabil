import sanitizeHtml from "sanitize-html";

const embeddedImagePattern = /^data:image\/(?:jpeg|png|webp);base64,/i;
const imageMetadataAttributes = [
  "data-image-original-src",
  "data-image-mobile-src",
  "data-image-trimmed-src",
] as const;

export function isAllowedArticleImageSource(value: string | undefined) {
  if (!value) return false;
  const source = value.trim();
  if (embeddedImagePattern.test(source)) return true;
  return source.startsWith("/")
    && !source.startsWith("//")
    && !source.includes("\\")
    && !/[\u0000-\u001f\u007f]/.test(source);
}

function safeImageSource(value: string | undefined) {
  return isAllowedArticleImageSource(value) ? value?.trim() || "" : "";
}

function safeLocalSrcset(value: string | undefined) {
  if (!value) return "";
  const candidates = value.split(",").map((candidate) => candidate.trim()).filter(Boolean);
  if (!candidates.length) return "";

  const safeCandidates = candidates.filter((candidate) => {
    const [source, descriptor, extra] = candidate.split(/\s+/);
    return !extra
      && isAllowedArticleImageSource(source)
      && (!descriptor || /^\d+(?:\.\d+)?[wx]$/.test(descriptor));
  });
  return safeCandidates.length === candidates.length ? safeCandidates.join(", ") : "";
}

export function sanitizeArticleContent(content: string) {
  return sanitizeHtml(content, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "picture", "source", "figure", "figcaption", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "sup", "sub", "u", "section"]),
    allowedAttributes: {
      a: ["href", "id", "aria-label", "class", "target", "rel"],
      img: ["src", "alt", "title", "width", "height", "loading", "decoding"],
      source: ["srcset", "media", "type", "width", "height"],
      figure: ["data-article-image", "data-image-width", "data-image-align", "data-image-fit", "data-image-zoom", "data-image-border", ...imageMetadataAttributes],
      div: ["data-article-toc", "data-article-formula", "data-latex", "data-display", "data-image-frame"],
      sup: [
        "id",
        "title",
        "data-footnote",
        "data-footnote-id",
        "data-footnote-number",
        "data-footnote-text",
        "data-footnote-reference-id",
        "data-footnote-citation-details",
        "data-footnote-segments",
      ],
      section: ["id", "class"],
      "*": ["id", "class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["data"] },
    allowProtocolRelative: false,
    transformTags: {
      h1: "h2",
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: attributes.target === "_blank"
          ? { ...attributes, rel: "noopener noreferrer" }
          : attributes,
      }),
      figure: (_tagName, attributes) => {
        const safeAttributes = { ...attributes };
        for (const attribute of imageMetadataAttributes) {
          if (attribute in safeAttributes) {
            const safeSource = safeImageSource(safeAttributes[attribute]);
            if (safeSource) safeAttributes[attribute] = safeSource;
            else delete safeAttributes[attribute];
          }
        }
        return { tagName: "figure", attribs: safeAttributes };
      },
      source: (_tagName, attributes) => {
        const safeAttributes = { ...attributes };
        const safeSrcset = safeLocalSrcset(attributes.srcset);
        if (safeSrcset) safeAttributes.srcset = safeSrcset;
        else delete safeAttributes.srcset;
        return { tagName: "source", attribs: safeAttributes };
      },
      img: (_tagName, attributes) => {
        const safeAttributes = { ...attributes };
        const safeSource = safeImageSource(attributes.src);
        if (safeSource) safeAttributes.src = safeSource;
        else delete safeAttributes.src;
        return {
          tagName: "img",
          attribs: {
            ...safeAttributes,
            loading: "lazy",
            decoding: "async",
          },
        };
      },
    },
  });
}
