"""/api/regras – regras de negócio do cliente.

Corrige: IDOR (qualquer pessoa lia/editava/excluía regras de qualquer cliente
passando `clienteId`/`id`); sem validação de enumerações; sem limite por cliente;
`mensagemErro` nula quebrava o front.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import config, validation as v
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler


def _item(r):
    return {"id": r.id, "nomeRegra": r.nomeRegra, "tipoGuia": r.tipoGuia, "campoValidado": r.campoValidado,
            "condicao": r.condicao, "valorEsperado": r.valorEsperado, "acao": r.acao,
            "mensagemErro": r.mensagemErro or ""}


def _campos(d):
    cond = v.escolha(d.get("condicao"), config.CONDICOES_REGRA, "Condição")
    valor = v.texto(d.get("valorEsperado"), "Valor esperado", 1, 100)
    if cond == "MAIOR_QUE":
        try:
            float(valor.replace(",", "."))
        except ValueError:
            raise ApiError(422, "Para 'Maior que', o valor deve ser numérico.", "validacao")
    return {"nomeRegra": v.texto(d.get("nomeRegra"), "Nome da regra", 2, 100),
            "tipoGuia": v.escolha(d.get("tipoGuia"), config.TIPOS_GUIA, "Tipo de guia"),
            "campoValidado": v.escolha(d.get("campoValidado"), config.CAMPOS_REGRA, "Campo"),
            "condicao": cond, "valorEsperado": valor,
            "acao": v.escolha(d.get("acao"), config.ACOES_REGRA, "Ação"),
            "mensagemErro": v.texto(d.get("mensagemErro"), "Mensagem", 0, 200, False)}


class handler(ApiHandler):
    def get(self, ctx):
        p = ctx.exigir()
        if p.tipo == "CLIENTE":
            cid = p.id  # ignora qualquer clienteId da URL
        else:
            ctx.exigir(tipo="INTERNO", permissao="regras:ler")
            cid = ctx.query.get("clienteId") or ""
            if not cid:
                raise ApiError(400, "ID do cliente não fornecido.")
        rows = get_db().regracliente.find_many(where={"clienteId": cid}, order={"criadoEm": "desc"}, take=config.MAX_REGRAS_POR_CLIENTE)
        return [_item(r) for r in rows]

    def post(self, ctx):
        p = ctx.exigir(tipo="CLIENTE")
        d = ctx.json()
        acao = d.get("acao_req", "criar")
        db = get_db()
        if acao == "criar":
            if db.regracliente.count(where={"clienteId": p.id}) >= config.MAX_REGRAS_POR_CLIENTE:
                raise ApiError(409, "Limite de regras atingido.", "limite")
            nova = db.regracliente.create(data={"clienteId": p.id, **_campos(d)})
            return {"sucesso": True, "id": nova.id}
        regra = db.regracliente.find_first(where={"id": str(d.get("id") or ""), "clienteId": p.id})
        if not regra:
            raise ApiError(404, "Regra não encontrada.")
        if acao == "excluir":
            db.regracliente.delete(where={"id": regra.id})
            return {"sucesso": True, "mensagem": "Regra excluída com sucesso."}
        if acao == "editar":
            db.regracliente.update(where={"id": regra.id}, data=_campos(d))
            return {"sucesso": True, "mensagem": "Regra atualizada com sucesso."}
        raise ApiError(400, "Ação desconhecida.")
