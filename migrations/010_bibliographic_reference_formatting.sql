ALTER TABLE bibliographic_references
  ADD COLUMN IF NOT EXISTS reference_html text;

ALTER TABLE bibliographic_references
  DROP CONSTRAINT IF EXISTS bibliographic_references_reference_html_length;

ALTER TABLE bibliographic_references
  ADD CONSTRAINT bibliographic_references_reference_html_length
  CHECK (reference_html IS NULL OR char_length(reference_html) BETWEEN 1 AND 40000);
