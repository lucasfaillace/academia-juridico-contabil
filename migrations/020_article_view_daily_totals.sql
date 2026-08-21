CREATE TABLE IF NOT EXISTS article_view_daily_totals (
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  viewed_on date NOT NULL,
  views bigint NOT NULL CHECK (views >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, viewed_on)
);

INSERT INTO article_view_daily_totals(article_id, viewed_on, views, updated_at)
SELECT article_id, viewed_on, COUNT(*)::bigint, now()
FROM article_views
GROUP BY article_id, viewed_on
ON CONFLICT (article_id, viewed_on) DO UPDATE SET
  views=EXCLUDED.views,
  updated_at=EXCLUDED.updated_at;

CREATE INDEX IF NOT EXISTS article_view_daily_totals_date_idx
  ON article_view_daily_totals(viewed_on DESC, article_id);

COMMENT ON TABLE article_view_daily_totals IS
  'Agregado diário para relatórios administrativos; os eventos brutos em article_views permanecem preservados.';
