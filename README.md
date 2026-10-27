# ValidaTISS – pacote de correções e evolução

Substitui/complementa os arquivos enviados. Veja o relatório completo (documento) para o *porquê* de cada mudança.

## Estrutura
```
api/            12 endpoints reescritos + auditoria + validador (Vercel Python)
vt_core/        núcleo compartilhado: config, security, web (CSRF/RBAC/erros), validation, db, audit, asaas, ia, tiss
js/modulos/     core.js (NOVO, carregar 1º), ui.js, auth.js, cliente.js, admin.js, tiss_hash.js (NOVO)
*.html          index, dashboard_cliente, admin (refeito)
css/style.css   original + bloco "VT-EXTRAS" no final
prisma/         schema.sugerido.prisma + migracao_sugerida.sql (REVISAR contra o seu schema real)
scripts/        criar_admin.py
tests/          test_api.py (22), e2e.py (Chromium), test_hash_paridade.py, fakes.py, devserver.py
vercel.json, requirements.txt
```

## Variáveis de ambiente (Vercel → Settings → Environment Variables)
| Variável | Obrigatória | Observação |
|---|---|---|
| `DATABASE_URL` / `DIRECT_URL` | sim | `DATABASE_URL` com **pooler** (pgbouncer=true&connection_limit=1) |
| `SESSION_SECRET` | sim | ≥ 32 caracteres aleatórios. **Trocar invalida todas as sessões** |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | p/ PIX | token do webhook configurado igual no painel Asaas; `ASAAS_BASE_URL` opcional (sandbox) |
| `PRECO_PREMIUM_MENSAL` | p/ assinatura | ex.: `99.90` — o valor **nunca** vem do navegador |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` | ≥ 1 | só os provedores com chave aparecem como válidos |
| `VT_DEV_INSEGURO` | **nunca em produção** | só testes locais (cookie sem `__Host-`/Secure) |

## Ordem de deploy (segura)
1. **Backup** do banco. Compare `prisma/schema.sugerido.prisma` com o seu `schema.prisma`; aplique só o que falta (campos novos: `tokenVersion`, `tentativasFalhas`, `bloqueadoAte`, `mustChangePassword`, `aceiteTermosEm`, `pagoEm`, `planoValidoAte`, `dataCancelamento`, `PagamentoProcessado`, `LogAdmin`) em **staging**.
2. Copie os XSD TISS para `schemas/` (nomes em `vt_core/config.py → VERSOES_TISS`).
3. Defina as variáveis acima. Gere o 1º admin: `python scripts/criar_admin.py "Nome" email@x.com` (a senha provisória é mostrada uma vez).
4. Deploy em **Preview**; confirme que `vt_core/` e `schemas/` foram empacotados (`vercel.json → includeFiles`) chamando `/api/validador` e `/api/auth`.
5. Troque a URL do webhook Asaas e o token; faça um PIX de R$ 1 em sandbox.
6. Promova para produção. Todos os usuários precisarão logar de novo (sessões antigas deixam de valer — esperado).

## Rodar os testes
```
export VT_DEV_INSEGURO=1 VT_BCRYPT_ROUNDS=4 SESSION_SECRET=$(python3 -c "print('x'*40)")
python tests/test_api.py          # 22 testes de API (banco falso em memória)
python tests/e2e.py               # fluxo completo no Chromium (Playwright)
python tests/test_hash_paridade.py
python tests/devserver.py 8000    # servidor local com banco falso
```
Os testes usam um bcrypt de mentira e um Prisma falso: **não substituem** um teste em staging com Postgres real.

## Pendências conhecidas (ver "Limites da análise" no relatório)
- `js/modulos/validador.js` não foi enviado: precisa chamar `/api/auditoria` com `{provedor, guia, itens, contexto}` **sem e-mail** e tratar 401/402; e recalcular o hash com `calcularHashTISS()` após editar o XML.
- `schemas/*.xsd` não vieram no pacote.
- Verifique a regra do hash do epílogo com um arquivo aceito pela operadora antes de tornar bloqueante.
