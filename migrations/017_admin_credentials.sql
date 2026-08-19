CREATE TABLE IF NOT EXISTS admin_credentials (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  email varchar(320) NOT NULL,
  password_hash text NOT NULL,
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_credentials_email_length CHECK (char_length(email) BETWEEN 3 AND 320),
  CONSTRAINT admin_credentials_password_hash_length CHECK (char_length(password_hash) BETWEEN 40 AND 1000)
);

