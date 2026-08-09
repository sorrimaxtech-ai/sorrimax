-- Permitir UPDATE na tabela clinicas
DROP POLICY IF EXISTS "Allow update clinicas" ON clinicas;
CREATE POLICY "Allow update clinicas" ON clinicas
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
