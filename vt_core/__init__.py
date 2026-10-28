"""vt_core – núcleo compartilhado das funções serverless do ValidaTISS.

Todos os endpoints em /api importam daqui:
  web         -> base HTTP (JSON, cookies, CSRF, erros padronizados, RBAC)
  security    -> senhas (bcrypt), sessão (JWT em cookie HttpOnly), permissões
  validation  -> validação/sanitização de entrada
  db          -> cliente Prisma único por processo (reaproveitado entre invocações)
  audit       -> trilha de auditoria das ações administrativas
  asaas       -> integração de pagamento PIX
  ia          -> provedores de IA (Gemini / OpenAI / DeepSeek)
  tiss        -> utilidades TISS (hash do epílogo, versão do padrão)
"""
