ALTER TABLE article_tags
  ADD COLUMN IF NOT EXISTS display_order integer NOT NULL DEFAULT 0;

WITH ordered_tags AS (
  SELECT article_id, tag_id,
         ROW_NUMBER() OVER (PARTITION BY article_id ORDER BY tag_id) - 1 AS position
  FROM article_tags
)
UPDATE article_tags AS current_tag
SET display_order = ordered_tags.position
FROM ordered_tags
WHERE current_tag.article_id = ordered_tags.article_id
  AND current_tag.tag_id = ordered_tags.tag_id;

CREATE INDEX IF NOT EXISTS article_tags_order_idx
  ON article_tags(article_id, display_order);
