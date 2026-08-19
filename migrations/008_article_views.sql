CREATE TABLE IF NOT EXISTS article_views (
  id bigserial PRIMARY KEY,
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  viewed_on date NOT NULL DEFAULT CURRENT_DATE,
  dedupe_key char(64)
);

CREATE UNIQUE INDEX IF NOT EXISTS article_views_dedupe_key_idx
  ON article_views(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS article_views_article_date_idx
  ON article_views(article_id, viewed_on DESC);

CREATE INDEX IF NOT EXISTS article_views_date_idx
  ON article_views(viewed_on DESC);

COMMENT ON COLUMN article_views.dedupe_key IS
  'Hash temporário para evitar contagens repetidas; deve ser removido após 48 horas.';
