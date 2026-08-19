CREATE TABLE IF NOT EXISTS reference_fichamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id uuid NOT NULL REFERENCES bibliographic_references(id) ON DELETE RESTRICT,
  kind text NOT NULL DEFAULT 'direta'
    CHECK (kind IN ('direta', 'indireta', 'anotacao')),
  content text NOT NULL,
  location text NOT NULL DEFAULT '',
  personal_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_fichamentos_content_length
    CHECK (char_length(content) BETWEEN 1 AND 20000),
  CONSTRAINT reference_fichamentos_location_length
    CHECK (char_length(location) <= 500),
  CONSTRAINT reference_fichamentos_personal_note_length
    CHECK (char_length(personal_note) <= 10000)
);

CREATE INDEX IF NOT EXISTS reference_fichamentos_reference_idx
  ON reference_fichamentos (reference_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS reference_fichamentos_search_idx
  ON reference_fichamentos
  USING gin (
    to_tsvector(
      'portuguese',
      content || ' ' || location || ' ' || personal_note
    )
  );
