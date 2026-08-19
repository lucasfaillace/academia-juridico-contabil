CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(120) NOT NULL UNIQUE, slug varchar(140) NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS tags (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(120) NOT NULL UNIQUE, slug varchar(140) NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(240) NOT NULL, slug varchar(260) NOT NULL UNIQUE,
  subtitle varchar(300), summary text NOT NULL DEFAULT '', content_html text NOT NULL, author_name varchar(180) NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL, featured_image varchar(500), featured_image_alt varchar(300),
  status varchar(20) NOT NULL CHECK (status IN ('draft','published')) DEFAULT 'draft', seo_title varchar(240),
  seo_description varchar(320), social_image varchar(500), original_docx_key varchar(500),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
);
CREATE TABLE IF NOT EXISTS article_tags (article_id uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE, tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY (article_id, tag_id));
CREATE TABLE IF NOT EXISTS courses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(220) NOT NULL, image varchar(500), summary text NOT NULL DEFAULT '', audience text, external_url varchar(1000), button_text varchar(80) NOT NULL DEFAULT 'Conhecer o curso', display_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS videos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title varchar(220) NOT NULL, url varchar(1000) NOT NULL, description text, image varchar(500), featured boolean NOT NULL DEFAULT false, display_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings (key varchar(120) PRIMARY KEY, value jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS articles_search_idx ON articles USING gin (to_tsvector('portuguese', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(content_html,'')));
CREATE INDEX IF NOT EXISTS articles_status_published_idx ON articles(status, published_at DESC);
