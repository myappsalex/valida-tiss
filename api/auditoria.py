"""/api/auditoria – pré-auditoria por IA (consome 1 token por análise).

Corrige: identidade vinha do `email` no corpo (dava para gastar tokens alheios);
verificação de saldo e débito separados (corrida: N requisições paralelas com 1
token); `provedor` livre; sem limite de itens; sem timeout; chave Gemini na URL;
saída da IA devolvida crua; dados do paciente potencialmente enviados.
Agora: reserva atômica do token ANTES da chamada e estorno se a IA falhar.
"""
import json
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import config, ia, validation as v
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler

MAX_ITENS = 60
CAMPOS_CONTEXTO = ("especialidade", "tipoGuia", "caraterAtendimento", "tipoInternacao", "tipoAtendimento")


def _itens(bruto):
    if not isinstance(bruto, list) or not bruto:
        raise ApiError(400, "Nenhum item encontrado nesta guia para analisar.")
    saida = []
    for it in bruto[:MAX_ITENS]:
        if not isinstance(it, dict) or str(it.get("codigoItem", "")) in ("", "-"):
            continue
        saida.append({"tipo": str(it.get("tipoDespesa", "Procedimento"))[:40],
                      "codigo": str(it.get("codigoItem", ""))[:20],
                      "descricao": str(it.get("descricaoItem", ""))[:200],
                      "qtd": str(it.get("qtdItem", ""))[:20],
                      "valor": str(it.get("valorItem", ""))[:20]})
    if not saida:
        raise ApiError(400, "Nenhum item válido para analisar.")
    return saida


class handler(ApiHandler):
    def post(self, ctx):
        p = ctx.exigir(tipo="CLIENTE")
        d = ctx.json(limite=256 * 1024)
        provedor = v.escolha(d.get("provedor", "gemini"), ia.provedores_habilitados(), "Provedor de IA")
        itens = _itens(d.get("itens"))
        contexto = {k: str(d["contexto"][k])[:60] for k in CAMPOS_CONTEXTO
                    if isinstance(d.get("contexto"), dict) and k in d["contexto"]}
        numero_guia = str(d.get("guia", "Desconhecida"))[:40]

        cli = p.rec
        if cli.statusConta != "ATIVO" or getattr(cli, "statusPagamento", "ATIVO") == "INATIVO":
            raise ApiError(403, "Plano inativo. Contacte o suporte.", "plano_inativo")

        db = get_db()
        # Reserva atômica: só debita se ainda houver saldo (sem corrida).
        if db.cliente.update_many(where={"id": cli.id, "tokensIA": {"gte": 1}},
                                  data={"tokensIA": {"decrement": 1}}) == 0:
            raise ApiError(402, "Sem tokens suficientes. Adquira mais tokens ou contacte o suporte.", "sem_tokens")
        try:
            resultado = ia.analisar(provedor, itens, contexto)
        except ia.IaErro:
            db.cliente.update(where={"id": cli.id}, data={"tokensIA": {"increment": 1}})  # estorno
            raise ApiError(502, "A análise de IA falhou. Seu token foi devolvido; tente novamente.", "ia_indisponivel")
        db.logia.create(data={"clienteId": cli.id, "numeroGuia": numero_guia,
                              "motorUsado": provedor, "tokensGastos": 1})
        saldo = db.cliente.find_unique(where={"id": cli.id}).tokensIA
        return {"sucesso": True, **resultado, "analise": json.dumps(resultado, ensure_ascii=False),
                "provedor_usado": provedor, "tokensRestantes": saldo,
                "aviso": "Apoio à decisão. Não substitui a análise do auditor."}
