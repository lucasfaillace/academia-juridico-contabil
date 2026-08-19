ALTER TABLE reference_fichamentos
  DROP CONSTRAINT IF EXISTS reference_fichamentos_kind_check;

UPDATE reference_fichamentos
SET kind='citacao'
WHERE kind IN ('direta', 'indireta');

ALTER TABLE reference_fichamentos
  ALTER COLUMN kind SET DEFAULT 'citacao';

ALTER TABLE reference_fichamentos
  ADD CONSTRAINT reference_fichamentos_kind_check
  CHECK (kind IN ('citacao', 'anotacao'));
