ALTER TABLE article_footnote_references
  ADD COLUMN IF NOT EXISTS occurrence_index integer NOT NULL DEFAULT 0;

ALTER TABLE article_footnote_references
  DROP CONSTRAINT IF EXISTS article_footnote_references_pkey;

ALTER TABLE article_footnote_references
  ADD CONSTRAINT article_footnote_references_pkey
  PRIMARY KEY (article_id, footnote_id, occurrence_index);

CREATE INDEX IF NOT EXISTS article_footnote_references_note_idx
  ON article_footnote_references (article_id, footnote_id, occurrence_index);
