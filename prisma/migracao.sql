-- Migração ADITIVA (nada é removido/renomeado). Equivale a `prisma db push` com prisma/schema.prisma.
-- Rode em STAGING (cópia do banco) e depois em produção, após backup. Nomes de tabela = nomes dos modelos.
BEGIN;

-- Cliente -------------------------------------------------------------------
ALTER TABLE "Cliente"
  ADD COLUMN IF NOT EXISTS "plano"              TEXT        NOT NULL DEFAULT 'FREEMIUM',
  ADD COLUMN IF NOT EXISTS "statusPagamento"    TEXT        NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN IF NOT EXISTS "planoValidoAte"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "tokenVersion"       INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tentativasFalhas"   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bloqueadoAte"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ultimoLoginEm"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "aceiteTermosEm"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "exportacoesGratis"  INTEGER     NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "dataCancelamento"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cpfCnpj"            TEXT,
  ADD COLUMN IF NOT EXISTS "asaasCustomerId"    TEXT;

-- Usuario (equipe interna) ----------------------------------------------------
ALTER TABLE "Usuario"
  ADD COLUMN IF NOT EXISTS "status"             TEXT        NOT NULL DEFAULT 'ATIVO',
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tokenVersion"       INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tentativasFalhas"   INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bloqueadoAte"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "ultimoLoginEm"      TIMESTAMP(3);
-- Legado: usuários que tiveram o `perfil` sobrescrito por BLOQUEADO/CANCELADO continuam bloqueados
-- (o código trata perfil BLOQUEADO/CANCELADO como status). Para normalizar, defina antes o perfil real manualmente.

-- CampanhaAds -----------------------------------------------------------------
ALTER TABLE "CampanhaAds"
  ADD COLUMN IF NOT EXISTS "bannerMime"     TEXT,
  ADD COLUMN IF NOT EXISTS "bannerDados"    TEXT,
  ADD COLUMN IF NOT EXISTS "asaasPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "pagoEm"         TIMESTAMP(3);
-- Campanhas antigas com status AGUARDANDO_PAGAMENTO sem cobrança passam a ser tratadas como ORCADO:
UPDATE "CampanhaAds" SET "status" = 'ORCADO' WHERE "status" = 'AGUARDANDO_PAGAMENTO' AND "asaasPaymentId" IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "CampanhaAds_asaasPaymentId_key" ON "CampanhaAds"("asaasPaymentId");
CREATE INDEX IF NOT EXISTS "CampanhaAds_usuarioId_status_idx"         ON "CampanhaAds"("usuarioId","status");
CREATE INDEX IF NOT EXISTS "CampanhaAds_status_dataInicio_dataFim_idx" ON "CampanhaAds"("status","dataInicio","dataFim");

-- Índices de leitura ----------------------------------------------------------
CREATE INDEX IF NOT EXISTS "LogIA_clienteId_dataUso_idx"          ON "LogIA"("clienteId","dataUso");
CREATE INDEX IF NOT EXISTS "RegraCliente_clienteId_criadoEm_idx"  ON "RegraCliente"("clienteId","criadoEm");

-- Novas tabelas ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "PagamentoProcessado" (
  "id" TEXT PRIMARY KEY, "referencia" TEXT NOT NULL, "valor" DOUBLE PRECISION NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS "LogAdmin" (
  "id" TEXT PRIMARY KEY, "atorTipo" TEXT NOT NULL, "atorId" TEXT NOT NULL, "atorEmail" TEXT NOT NULL,
  "acao" TEXT NOT NULL, "alvoTipo" TEXT NOT NULL, "alvoId" TEXT NOT NULL, "detalhes" TEXT NOT NULL, "ip" TEXT NOT NULL,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS "LogAdmin_criadoEm_idx"          ON "LogAdmin"("criadoEm");
CREATE INDEX IF NOT EXISTS "LogAdmin_alvoTipo_alvoId_idx"   ON "LogAdmin"("alvoTipo","alvoId");

COMMIT;

-- ---------------------------------------------------------------------------
-- OPCIONAL (rode separado; pode demorar na tabela TUSS grande)
-- 1) Busca por descrição (ILIKE) rápida:
--    CREATE EXTENSION IF NOT EXISTS pg_trgm;
--    CREATE INDEX IF NOT EXISTS "DominioTUSS_termo_trgm" ON "DominioTUSS" USING gin ("termo" gin_trgm_ops);
-- 2) Evita duplicados na carga TUSS (a carga usa create_many(skip_duplicates)). ANTES, confira se já há duplicados:
--    SELECT "codigoTabela","codigoTermo","vigenciaInicio","vigenciaFim",COALESCE("fabricante",''),COALESCE("apresentacaoModelo",''),count(*)
--      FROM "DominioTUSS" GROUP BY 1,2,3,4,5,6 HAVING count(*) > 1;
--    Se retornar linhas, remova-as primeiro; depois:
--    CREATE UNIQUE INDEX IF NOT EXISTS "DominioTUSS_unico_vigencia" ON "DominioTUSS"
--      ("codigoTabela","codigoTermo",COALESCE("vigenciaInicio",'epoch'),COALESCE("vigenciaFim",'epoch'),
--       COALESCE("fabricante",''),COALESCE("apresentacaoModelo",''));
