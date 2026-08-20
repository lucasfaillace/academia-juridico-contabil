CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS bibliographic_references_similarity_idx
  ON bibliographic_references
  USING gin (normalized_text gin_trgm_ops);

COMMENT ON INDEX bibliographic_references_similarity_idx IS
  'Seleciona um conjunto pequeno de referências semelhantes antes da comparação editorial exata.';
