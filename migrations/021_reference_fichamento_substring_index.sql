CREATE INDEX IF NOT EXISTS reference_fichamentos_substring_idx
  ON reference_fichamentos
  USING gin ((lower(literal_quote || ' ' || paraphrase || ' ' || location || ' ' || personal_note)) gin_trgm_ops);

COMMENT ON INDEX reference_fichamentos_substring_idx IS
  'Acelera a pesquisa administrativa por expressões parciais dentro dos fichamentos.';
