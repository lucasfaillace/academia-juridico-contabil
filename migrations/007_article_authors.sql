ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS author_names jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE articles
SET author_names = jsonb_build_array(author_name)
WHERE author_names = '[]'::jsonb
  AND length(trim(author_name)) > 0;

ALTER TABLE articles
  DROP CONSTRAINT IF EXISTS articles_author_names_array;

ALTER TABLE articles
  ADD CONSTRAINT articles_author_names_array
  CHECK (
    jsonb_typeof(author_names) = 'array'
    AND jsonb_array_length(author_names) BETWEEN 1 AND 20
  );
