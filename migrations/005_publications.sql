CREATE TABLE IF NOT EXISTS publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_html text NOT NULL,
  pdf_key varchar(500),
  external_url varchar(1000),
  publication_date date NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS publications_status_date_idx
  ON publications(status, publication_date DESC, created_at DESC);
