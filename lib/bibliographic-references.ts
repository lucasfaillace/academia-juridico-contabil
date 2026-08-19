import {
  abbreviatedReferenceText,
  decodeFootnoteSegments,
  normalizedReferenceLocation,
} from "./footnote-segments";

export type FootnoteReferenceLink = {
  footnoteId: string;
  noteNumber: number;
  referenceId: string;
  citationDetails: string;
  occurrenceIndex: number;
};

export function referenceTextFromMarkup(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeReferenceText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function bigrams(value: string) {
  const normalized = ` ${normalizeReferenceText(value)} `;
  const result = new Map<string, number>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const pair = normalized.slice(index, index + 2);
    result.set(pair, (result.get(pair) || 0) + 1);
  }
  return result;
}

export function referenceSimilarity(left: string, right: string) {
  const a = normalizeReferenceText(left);
  const b = normalizeReferenceText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const leftPairs = bigrams(a);
  const rightPairs = bigrams(b);
  let overlap = 0;
  let leftSize = 0;
  let rightSize = 0;
  for (const count of leftPairs.values()) leftSize += count;
  for (const count of rightPairs.values()) rightSize += count;
  for (const [pair, count] of leftPairs) overlap += Math.min(count, rightPairs.get(pair) || 0);
  return (2 * overlap) / Math.max(1, leftSize + rightSize);
}

function decodeAttribute(value: string) {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
  return decodeAttribute(match?.[1] ?? match?.[2] ?? "");
}

export function extractFootnoteReferenceLinks(html: string): FootnoteReferenceLink[] {
  const tags = html.match(/<sup\b[^>]*\bdata-footnote(?:=(?:""|'')|\s|>)[^>]*>/gi) || [];
  return tags
    .flatMap((tag) => {
      const footnoteId = attribute(tag, "data-footnote-id");
      const noteNumber = Number(attribute(tag, "data-footnote-number") || 0);
      const legacyCitationDetails = attribute(tag, "data-footnote-citation-details");
      const segments = decodeFootnoteSegments(attribute(tag, "data-footnote-segments"), {
        text: attribute(tag, "data-footnote-text"),
        referenceId: attribute(tag, "data-footnote-reference-id"),
        citationDetails: legacyCitationDetails,
      });
      return segments.flatMap((segment, segmentIndex) => {
        if (segment.type !== "reference") return [];
        const followingText = segments[segmentIndex + 1];
        const explicitLocation = normalizedReferenceLocation(segment.location);
        const citationDetails = segment.presentation === "full"
          ? explicitLocation || (followingText?.type === "text" ? referenceTextFromMarkup(followingText.html) : "")
          : abbreviatedReferenceText(segment.presentation, explicitLocation);
        return [{
          footnoteId,
          noteNumber,
          referenceId: segment.referenceId,
          citationDetails,
          occurrenceIndex: segmentIndex,
        }];
      });
    })
    .filter((item) =>
      item.footnoteId.length > 0
      && item.referenceId.length > 0
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.referenceId)
      && Number.isInteger(item.noteNumber)
      && item.noteNumber > 0,
    );
}
