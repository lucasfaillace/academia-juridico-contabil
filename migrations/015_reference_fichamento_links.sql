CREATE TABLE IF NOT EXISTS reference_fichamento_links (
  source_fichamento_id uuid NOT NULL REFERENCES reference_fichamentos(id) ON DELETE CASCADE,
  target_fichamento_id uuid NOT NULL REFERENCES reference_fichamentos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source_fichamento_id, target_fichamento_id),
  CONSTRAINT reference_fichamento_links_distinct CHECK (source_fichamento_id <> target_fichamento_id)
);

CREATE INDEX IF NOT EXISTS reference_fichamento_links_target_idx
  ON reference_fichamento_links(target_fichamento_id);
