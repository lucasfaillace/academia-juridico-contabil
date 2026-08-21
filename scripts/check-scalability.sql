\set ON_ERROR_STOP on

BEGIN;

INSERT INTO bibliographic_references(reference_text, normalized_text)
SELECT
  'AUTOR DE TESTE, ' || series || '. Obra para validação de escalabilidade.',
  'autor de teste ' || series || ' obra para validacao de escalabilidade'
FROM generate_series(1, 5000) series;

INSERT INTO reference_fichamentos(reference_id, kind, literal_quote, paraphrase, location, personal_note)
SELECT id, 'citacao', 'Expressão de escalabilidade ' || row_number() OVER (), '', 'p. 1', ''
FROM bibliographic_references
ORDER BY id
LIMIT 2000;

INSERT INTO articles(title, slug, content_html, author_name, author_names, status, published_at)
VALUES ('Artigo de carga', 'artigo-de-carga', '<p>Teste</p>', 'Teste', '["Teste"]'::jsonb, 'published', now());

INSERT INTO article_views(article_id, viewed_on, dedupe_key)
SELECT article.id, current_date - day_offset, NULL
FROM articles article
CROSS JOIN generate_series(0, 364) day_offset
CROSS JOIN generate_series(1, 25) event_number
WHERE article.slug='artigo-de-carga';

INSERT INTO article_view_daily_totals(article_id, viewed_on, views)
SELECT article_id, viewed_on, COUNT(*)::bigint
FROM article_views
GROUP BY article_id, viewed_on
ON CONFLICT (article_id, viewed_on) DO UPDATE SET views=EXCLUDED.views, updated_at=now();

ANALYZE bibliographic_references;
ANALYZE reference_fichamentos;
ANALYZE article_view_daily_totals;

DO $$
DECLARE
  reference_count integer;
  page_count integer;
  fichamento_match_count integer;
  raw_view_count bigint;
  aggregate_view_count bigint;
BEGIN
  SELECT COUNT(*) INTO reference_count FROM bibliographic_references;
  IF reference_count < 5000 THEN RAISE EXCEPTION 'Carga de referências incompleta: %', reference_count; END IF;

  SELECT COUNT(*) INTO page_count
  FROM (
    SELECT id
    FROM bibliographic_references
    WHERE normalized_text ILIKE '%obra para validacao%'
    ORDER BY lower(reference_text), id
    LIMIT 30 OFFSET 3000
  ) page;
  IF page_count <> 30 THEN RAISE EXCEPTION 'Página SQL incompleta: %', page_count; END IF;

  SELECT COUNT(*) INTO fichamento_match_count
  FROM reference_fichamentos
  WHERE lower(literal_quote || ' ' || paraphrase || ' ' || location || ' ' || personal_note)
    LIKE '%expressão de escalabilidade%';
  IF fichamento_match_count <> 2000 THEN RAISE EXCEPTION 'Pesquisa em fichamentos divergente: %', fichamento_match_count; END IF;

  SELECT COUNT(*) INTO raw_view_count
  FROM article_views views
  JOIN articles article ON article.id=views.article_id
  WHERE article.slug='artigo-de-carga';
  SELECT COALESCE(SUM(totals.views), 0) INTO aggregate_view_count
  FROM article_view_daily_totals totals
  JOIN articles article ON article.id=totals.article_id
  WHERE article.slug='artigo-de-carga';
  IF raw_view_count <> 9125 OR aggregate_view_count <> raw_view_count THEN
    RAISE EXCEPTION 'Agregação diária divergente: bruto %, agregado %', raw_view_count, aggregate_view_count;
  END IF;
END $$;

ROLLBACK;
