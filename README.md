# ValidaTISS – pacote de correções e evolução

Substitui/complementa os arquivos enviados. Veja o relatório completo (documento) para o *porquê* de cada mudança.

## Estrutura
```
api/            13 endpoints (Vercel Python), incl. NOVO exportacao.py (degustação FREEMIUM no servidor)
vt_core/        núcleo compartilhado: config, security, web (CSRF/RBAC/erros), validation, db, audit, asaas, ia, tiss
js/modulos/     core.js (NOVO, carregar 1º), ui.js, auth.js, cliente.js, admin.js, tiss_hash.js (NOVO), validador.js (REESCRITO; o seu original está em validador.original.js — pode apagar)
*.html          index, dashboard_cliente, admin (refeito)
css/style.css   original + bloco "VT-EXTRAS" no final
prisma/         schema.prisma (SEU schema + acréscimos marcados "NOVO"), migracao.sql (equivale a `prisma db push`), schema.original.prisma (o que você enviou)
scripts/        criar_admin.py
tests/          test_api.py (29), e2e.py e e2e_validador.py (Chromium), test_hash_paridade.py, fakes.py, devserver.py
vercel.json, requirements.txt
```

## Variáveis de ambiente (Vercel → Settings → Environment Variables)
| Variável | Obrigatória | Observação |
|---|---|---|
| `VALIDA_TISS_DATABASE_POSTGRES_URL` | sim | já é a variável do seu schema; use a URL do **pooler** (pgbouncer=true&connection_limit=1) |
| `SESSION_SECRET` | sim | ≥ 32 caracteres aleatórios. **Trocar invalida todas as sessões** |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | p/ PIX | token do webhook configurado igual no painel Asaas; `ASAAS_BASE_URL` opcional (sandbox) |
| `PRECO_PREMIUM_MENSAL` | p/ assinatura | ex.: `99.90` — o valor **nunca** vem do navegador |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` | ≥ 1 | só os provedores com chave aparecem como válidos |
| `VT_DEV_INSEGURO` | **nunca em produção** | só testes locais (cookie sem `__Host-`/Secure) |

## Ordem de deploy (segura)
1. **Backup** do banco. Em **staging**, aplique `prisma/migracao.sql` (ou copie `prisma/schema.prisma` para o projeto e rode `prisma db push`). São só acréscimos: nada é removido ou renomeado.
2. Copie os XSD TISS para `schemas/` (nomes em `vt_core/config.py → VERSOES_TISS`).
3. Defina as variáveis acima. Gere o 1º admin: `python scripts/criar_admin.py "Nome" email@x.com` (a senha provisória é mostrada uma vez).
4. Deploy em **Preview**; confirme que `vt_core/` e `schemas/` foram empacotados (`vercel.json → includeFiles`) chamando `/api/validador` e `/api/auth`.
5. Troque a URL do webhook Asaas e o token; faça um PIX de R$ 1 em sandbox.
6. Promova para produção. Todos os usuários precisarão logar de novo (sessões antigas deixam de valer — esperado).

## Rodar os testes
```
export VT_DEV_INSEGURO=1 VT_BCRYPT_ROUNDS=4 SESSION_SECRET=$(python3 -c "print('x'*40)")
python tests/test_api.py          # 29 testes de API (banco falso que confere cada campo contra prisma/schema.prisma)
python tests/e2e.py               # fluxo completo no Chromium (Playwright)
python tests/e2e_validador.py     # upload de XML, glosas, edição, TUSS, exportação ISO-8859-1 + hash (usa XSD permissivo temporário)
python tests/test_hash_paridade.py
python tests/devserver.py 8000    # servidor local com banco falso
```
Os testes usam um bcrypt de mentira e um Prisma falso: **não substituem** um teste em staging com Postgres real.

## Pendências conhecidas (ver "Limites da análise" no relatório)
- `schemas/*.xsd` não vieram no pacote: sem eles `/api/validador` responde 500 "Schema indisponível".
- Rode `prisma/migracao.sql` (agora inclui `Cliente.exportacoesGratis`) e depois `prisma generate` no build da Vercel.
- Exportação do XML corrigido: o crédito FREEMIUM é debitado no servidor, mas o XML ainda é montado no navegador (quem remontar o arquivo à mão não é impedido). Bloqueio total exige gerar o XML no servidor.
- O hash do epílogo só é regravado na exportação se o hash ORIGINAL do arquivo bater com o algoritmo (MD5 dos textos fora do epílogo, ISO-8859-1); caso contrário o usuário é avisado. Valide com um arquivo aceito pela operadora antes de torná-lo bloqueante.
- A verificação TUSS (✅/❌) depende da base `DominioTUSS` carregada; só vale para as tabelas 18, 19, 20 e 22 e só para usuários logados.
