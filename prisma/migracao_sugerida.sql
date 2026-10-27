-- Rode em STAGING primeiro, após backup. Ajuste aos nomes reais das tabelas.
-- Índices de busca TUSS (starts_with + ILIKE):
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_tuss_termo_trgm ON "DominioTuss" USING gin ("termo" gin_trgm_ops);
-- Unicidade para o create_many(skip_duplicates) da carga TUSS:
CREATE UNIQUE INDEX IF NOT EXISTS uq_tuss_vigencia
  ON "DominioTuss" ("codigoTabela","codigoTermo",COALESCE("vigenciaInicio",'epoch'),COALESCE("vigenciaFim",'epoch'),
                    COALESCE("fabricante",''),COALESCE("apresentacaoModelo",''));
-- Invalida sessões antigas ao subir (tokenVersion novo): nada a fazer, o JWT antigo já é recusado
-- pois o novo segredo/cookie (__Host-) é diferente.
