ALTER TABLE tags
  ADD COLUMN IF NOT EXISTS kind varchar(20) NOT NULL DEFAULT 'geral';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tags_kind_check'
  ) THEN
    ALTER TABLE tags
      ADD CONSTRAINT tags_kind_check
      CHECK (kind IN ('juridica', 'contabil', 'geral'));
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS article_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES article_comments(id) ON DELETE CASCADE,
  author_name varchar(100) NOT NULL,
  body text NOT NULL,
  is_admin boolean NOT NULL DEFAULT false,
  status varchar(20) NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS article_comments_article_created_idx
  ON article_comments(article_id, created_at);

CREATE INDEX IF NOT EXISTS article_comments_parent_idx
  ON article_comments(parent_id);
