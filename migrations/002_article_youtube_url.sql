ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS youtube_url varchar(1000);
