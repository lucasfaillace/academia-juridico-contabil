CREATE TABLE IF NOT EXISTS article_preview_snapshots (
  article_id uuid PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
