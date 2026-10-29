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
tests/          test_api.py (29), test_xsd_real.py (5), e2e.py e e2e_validador.py (Chromium), test_hash_paridade.py, amostras.py (lotes 4.03.00 válidos), fakes.py, devserver.py
vercel.json, requirements.txt
```

## Variáveis de ambiente (Vercel → Settings → Environment Variables)
| Variável | Obrigatória | Observação |
|---|---|---|
| `VALIDA_TISS_DATABASE_POSTGRES_URL` | sim | já é a variável do seu schema; use a URL do **pooler** (pgbouncer=true&connection_limit=1) |
| `SESSION_SECRET` | sim | ≥ 32 caracteres aleatórios. **Trocar invalida todas as sessões** |
| `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN` | p/ PIX | token do webhook configurado igual no painel Asaas; `ASAAS_BASE_URL` opcional (sandbox) |
| `PRECO_TOKEN` | opcional | **valor inicial/reserva**: depois de salvo em ⚙️ Preços e Planos (tabela `Configuracao`), o banco vence |
| `PRECO_PREMIUM_MENSAL` | p/ assinatura | ex.: `99.90` — o valor **nunca** vem do navegador |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` | ≥ 1 | só os provedores com chave aparecem como válidos |
| `VT_DEV_INSEGURO` | **nunca em produção** | só testes locais (cookie sem `__Host-`/Secure) |

## Limite de 12 funções (Vercel Hobby)
Há exatamente 12 arquivos em `api/`. Por isso: compra de tokens fica em `/api/gerar_pix` (`tipo: TOKENS`), anúncios ativos em `/api/publicidade?acao=ativas` e edição de assinatura em `/api/gestao_usuarios` (`acao: editar_assinatura`). Não crie novos arquivos em `api/` sem remover outro.

## Preços e planos (painel admin)
Os preços ficam na tabela `Configuracao` e são editados em **Admin → ⚙️ Preços e Planos** (só ADMIN, permissão `config:editar`). Vale na hora, sem deploy; cada alteração entra no log de auditoria (`CONFIG_ALTERADA`). Ordem de leitura: banco → variável de ambiente → padrão. O sistema guarda o preço anterior: PIX emitido antes de um reajuste ainda é aceito pelo webhook. Optei por tabela e não pela API da Vercel porque ela exige um token com poder sobre todo o projeto, e variáveis só valem após novo deploy.

## Anúncio avulso (anunciante sem cadastro)
Visitantes e a equipe (permissão `ads:criar`) podem registrar pedidos sem login. Eles ficam na conta de sistema `GUEST` (não autentica, oculta na gestão de usuários), com limite de 3 pendentes por e-mail e 100 globais. A logo externa deve ser `https://`. O pagamento é concluído pela equipe (contato e ativação manual), pois não há conta para pagar o PIX.

## Ordem de deploy (segura)
1. **Backup** do banco. Em **staging**, aplique `prisma/migracao.sql` (ou copie `prisma/schema.prisma` para o projeto e rode `prisma db push`). São só acréscimos: nada é removido ou renomeado.
2. Os XSD TISS já estão em `schemas/` (34 arquivos: 8 versões + tipos simples/complexos/guias + assinatura digital). Mantenha todos juntos: cada `tissV…xsd` inclui os demais.
3. Defina as variáveis acima. Gere o 1º admin: `python scripts/criar_admin.py "Nome" email@x.com` (a senha provisória é mostrada uma vez).
4. Deploy em **Preview**; confirme que `vt_core/` e `schemas/` foram empacotados (`vercel.json → includeFiles`) chamando `/api/validador` e `/api/auth`.
5. Troque a URL do webhook Asaas e o token; faça um PIX de R$ 1 em sandbox.
6. Promova para produção. Todos os usuários precisarão logar de novo (sessões antigas deixam de valer — esperado).

## Rodar os testes
```
export VT_DEV_INSEGURO=1 VT_BCRYPT_ROUNDS=4 SESSION_SECRET=$(python3 -c "print('x'*40)")
python tests/test_api.py          # 29 testes de API (banco falso que confere cada campo contra prisma/schema.prisma)
python tests/e2e.py               # fluxo completo no Chromium (Playwright)
python tests/e2e_validador.py     # upload de XML, glosas, edição, TUSS, totais/hash, exportação ISO-8859-1 — com o XSD OFICIAL 4.03.00
python tests/test_xsd_real.py     # carga das 8 versões, amostras válidas/inválidas e /api/validador com o XSD real
python tests/test_hash_paridade.py
python tests/devserver.py 8000    # servidor local com banco falso
```
Os testes usam um bcrypt de mentira e um Prisma falso: **não substituem** um teste em staging com Postgres real.

## Migração desta versão
Rode `prisma/migracao.sql` (tabela `CompraTokens`, coluna `exportacoesGratis`) antes do deploy e defina `SESSION_SECRET` na Vercel: o código não tem valor padrão de propósito (um padrão público permitiria forjar sessões).

## Pendências conhecidas (ver "Limites da análise" no relatório)
- XSD **3.02.01 e 3.02.02**: os arquivos da ANS referenciam o tipo `ans:assinaturaDigital`, que não existe em nenhum arquivo enviado; essas duas versões não carregam e `/api/validador` responde 503 para elas (3.03.00 a 4.03.00 funcionam). Se precisar delas, procure o pacote 3.02.x completo na ANS.
- Rode `prisma/migracao.sql` (agora inclui `Cliente.exportacoesGratis`) e depois `prisma generate` no build da Vercel.
- Exportação do XML corrigido: o crédito FREEMIUM é debitado no servidor, mas o XML ainda é montado no navegador (quem remontar o arquivo à mão não é impedido). Bloqueio total exige gerar o XML no servidor.
- O hash do epílogo só é regravado na exportação se o hash ORIGINAL do arquivo bater com o algoritmo (MD5 dos textos fora do epílogo, ISO-8859-1); caso contrário o usuário é avisado. Valide com um arquivo aceito pela operadora antes de torná-lo bloqueante.
- A verificação TUSS (✅/❌) depende da base `DominioTUSS` carregada; só vale para as tabelas 18, 19, 20 e 22 e só para usuários logados.
