ALTER TABLE reference_fichamentos
  ADD COLUMN IF NOT EXISTS literal_quote text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS paraphrase text NOT NULL DEFAULT '';

UPDATE reference_fichamentos
SET literal_quote = CASE WHEN kind = 'citacao' THEN content ELSE literal_quote END,
    paraphrase = CASE WHEN kind = 'anotacao' THEN content ELSE paraphrase END
WHERE literal_quote = '' AND paraphrase = '' AND COALESCE(content, '') <> '';

ALTER TABLE reference_fichamentos
  DROP CONSTRAINT IF EXISTS reference_fichamentos_content_length,
  ALTER COLUMN content DROP NOT NULL;

ALTER TABLE reference_fichamentos
  ADD CONSTRAINT reference_fichamentos_literal_quote_length
    CHECK (char_length(literal_quote) <= 20000),
  ADD CONSTRAINT reference_fichamentos_paraphrase_length
    CHECK (char_length(paraphrase) <= 20000),
  ADD CONSTRAINT reference_fichamentos_has_content
    CHECK (
      char_length(trim(literal_quote)) > 0
      OR char_length(trim(paraphrase)) > 0
      OR char_length(trim(personal_note)) > 0
    );

DROP INDEX IF EXISTS reference_fichamentos_search_idx;

CREATE INDEX reference_fichamentos_search_idx
  ON reference_fichamentos
  USING gin (
    to_tsvector(
      'portuguese',
      literal_quote || ' ' || paraphrase || ' ' || location || ' ' || personal_note
    )
  );
