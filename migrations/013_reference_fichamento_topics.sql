CREATE TABLE IF NOT EXISTS reference_fichamento_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reference_fichamento_topics_name_length
    CHECK (char_length(name) BETWEEN 2 AND 120)
);

CREATE TABLE IF NOT EXISTS reference_fichamento_topic_links (
  fichamento_id uuid NOT NULL REFERENCES reference_fichamentos(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES reference_fichamento_topics(id) ON DELETE RESTRICT,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  PRIMARY KEY (fichamento_id, topic_id)
);

CREATE INDEX IF NOT EXISTS reference_fichamento_topic_links_topic_idx
  ON reference_fichamento_topic_links (topic_id, fichamento_id);

CREATE INDEX IF NOT EXISTS reference_fichamento_topics_name_idx
  ON reference_fichamento_topics (lower(name));
