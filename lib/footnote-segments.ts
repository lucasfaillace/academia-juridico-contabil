export type FootnoteTextSegment = {
  id: string;
  type: "text";
  html: string;
};

export type FootnoteReferenceSegment = {
  id: string;
  type: "reference";
  referenceId: string;
  presentation: "full" | "ibid" | "idem" | "opcit";
  location: string;
};

export type FootnoteSegment = FootnoteTextSegment | FootnoteReferenceSegment;

function segmentId(value: unknown, index: number) {
  return typeof value === "string" && value.trim() ? value : `segment-${index + 1}`;
}

function validSegments(value: unknown): FootnoteSegment[] {
  if (!Array.isArray(value)) return [];
  const result: FootnoteSegment[] = [];
  value.forEach((segment, index) => {
    if (!segment || typeof segment !== "object") return;
    const candidate = segment as Record<string, unknown>;
    if (candidate.type === "text") {
      result.push({
        id: segmentId(candidate.id, index),
        type: "text",
        html: typeof candidate.html === "string" ? candidate.html : "",
      });
      return;
    }
    if (candidate.type === "reference") {
      const presentation = candidate.presentation === "ibid" || candidate.presentation === "idem" || candidate.presentation === "opcit"
        ? candidate.presentation
        : "full";
      result.push({
        id: segmentId(candidate.id, index),
        type: "reference",
        referenceId: typeof candidate.referenceId === "string" ? candidate.referenceId : "",
        presentation,
        location: typeof candidate.location === "string" ? candidate.location.slice(0, 300) : "",
      });
    }
  });
  return result;
}

export function legacyFootnoteSegments(
  text = "",
  referenceId = "",
  citationDetails = "",
): FootnoteSegment[] {
  const segments: FootnoteSegment[] = [];
  if (text || (!referenceId && !citationDetails)) {
    segments.push({ id: "legacy-text", type: "text", html: text });
  }
  if (referenceId) {
    segments.push({ id: "legacy-reference", type: "reference", referenceId, presentation: "full", location: "" });
  }
  if (citationDetails) {
    segments.push({ id: "legacy-details", type: "text", html: citationDetails });
  }
  return segments;
}

export function decodeFootnoteSegments(
  encoded: string | null | undefined,
  legacy: { text?: string; referenceId?: string; citationDetails?: string } = {},
): FootnoteSegment[] {
  if (encoded) {
    try {
      const decoded = encoded.trim().startsWith("[") ? encoded : decodeURIComponent(encoded);
      const parsed = JSON.parse(decoded);
      if (Array.isArray(parsed)) return validSegments(parsed);
    } catch {
      // Conteúdo antigo ou atributo malformado: usa os campos legados abaixo.
    }
  }
  return legacyFootnoteSegments(legacy.text, legacy.referenceId, legacy.citationDetails);
}

export function encodeFootnoteSegments(segments: FootnoteSegment[]) {
  return encodeURIComponent(JSON.stringify(validSegments(segments)));
}

export function replacesTerminalReferencePeriod(nextText: string) {
  return /^[,;:)\]]/.test(nextText.trimStart());
}

export function removeTerminalReferencePeriod(value: string) {
  return value.replace(
    /\.(?=(?:\s*<\/(?:a|b|strong|i|em|u|sup|sub|span|p)>)*\s*$)/i,
    "",
  );
}

export function normalizedReferenceLocation(value: string) {
  return value.trim().replace(/^[,;:\s]+/, "").replace(/\s+/g, " ");
}

export function abbreviatedReferenceText(
  presentation: FootnoteReferenceSegment["presentation"],
  location = "",
) {
  const label = presentation === "ibid"
    ? "Ibid."
    : presentation === "idem"
      ? "Id."
      : presentation === "opcit"
        ? "op. cit."
        : "";
  if (!label) return "";
  const normalizedLocation = normalizedReferenceLocation(location).replace(/[.\s]+$/, "");
  return normalizedLocation ? `${label}, ${normalizedLocation}.` : label;
}
