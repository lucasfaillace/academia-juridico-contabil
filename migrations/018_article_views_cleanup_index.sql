CREATE INDEX IF NOT EXISTS article_views_expired_dedupe_idx
  ON article_views(viewed_at)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON INDEX article_views_expired_dedupe_idx IS
  'Acelera a limpeza periódica das chaves temporárias sem percorrer todo o histórico.';
