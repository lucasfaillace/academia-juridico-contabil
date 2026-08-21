const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedInteger(value: string | null, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}
function uuidList(value: string | null, maximum: number) {
  if (!value) return [];
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter((item) => uuidPattern.test(item))))
    .slice(0, maximum);
}

export function referenceListParameters(url: string) {
  const search = new URL(url).searchParams;
  return {
    page: boundedInteger(search.get("page"), 1, 1, 100_000),
    pageSize: boundedInteger(search.get("pageSize"), 30, 1, 100),
    query: (search.get("q") || "").trim().slice(0, 200),
    fichamentoQuery: (search.get("fichamentoQ") || "").trim().slice(0, 500),
    topicIds: uuidList(search.get("topicIds"), 20),
    ids: uuidList(search.get("ids"), 100),
    detailId: uuidList(search.get("id"), 1)[0] || "",
  };
}
