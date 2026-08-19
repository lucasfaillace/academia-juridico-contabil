CREATE TABLE IF NOT EXISTS bibliographic_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_text text NOT NULL,
  normalized_text text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (char_length(reference_text) BETWEEN 10 AND 5000)
);

CREATE TABLE IF NOT EXISTS article_footnote_references (
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  footnote_id varchar(120) NOT NULL,
  reference_id uuid NOT NULL REFERENCES bibliographic_references(id) ON DELETE RESTRICT,
  note_number integer NOT NULL CHECK (note_number > 0),
  citation_details text NOT NULL DEFAULT '',
  PRIMARY KEY (article_id, footnote_id)
);

CREATE INDEX IF NOT EXISTS bibliographic_references_alphabetical_idx
  ON bibliographic_references (lower(reference_text));

CREATE INDEX IF NOT EXISTS article_footnote_references_reference_idx
  ON article_footnote_references (reference_id);

CREATE INDEX IF NOT EXISTS article_footnote_references_article_idx
  ON article_footnote_references (article_id, note_number);
