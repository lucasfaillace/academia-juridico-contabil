export class ExportLimitError extends Error {
  readonly limit: number;

  constructor(
    message: string,
    limit: number,
  ) {
    super(message);
    this.name = "ExportLimitError";
    this.limit = limit;
  }
}

function configuredLimit(name: string, fallback: number, ceiling: number) {
  const value = Number(process.env[name] || fallback);
  return Number.isInteger(value) && value > 0 && value <= ceiling ? value : fallback;
}

export function articleExportLimit() {
  return configuredLimit("MAX_BULK_ARTICLE_EXPORT", 500, 5000);
}

export function referenceExportLimit() {
  return configuredLimit("MAX_REFERENCE_EXPORT", 5000, 20_000);
}

export function fichamentoExportLimit() {
  return configuredLimit("MAX_FICHAMENTO_EXPORT", 20_000, 100_000);
}
