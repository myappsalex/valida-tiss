"""/api/dominio_tuss – consulta (logado) e manutenção (staff) dos domínios TUSS.

Corrige: POST de editar/excluir sem autenticação; `acao` desconhecida não
respondia nada; exclusão física (agora inativa, reversível e auditada); busca
sem filtro de tabela, `contains` por código (varredura) e sem paginação.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import audit, config, validation as v
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler


def _item(r):
    return {"id": r.id, "codigoTabela": r.codigoTabela, "codigoTermo": r.codigoTermo,
            "termo": r.termo, "registroAnvisa": r.registroAnvisa, "ativo": r.ativo,
            "fabricante": getattr(r, "fabricante", None), "apresentacaoModelo": getattr(r, "apresentacaoModelo", None),
            "classeRisco": getattr(r, "classeRisco", None)}


def _validar_lote(codigos):
    """Devolve quais códigos existem (e estão ativos) em DominioTUSS. Máx. 500 por chamada."""
    if not isinstance(codigos, list) or len(codigos) > 500:
        raise ApiError(422, "Envie uma lista de até 500 códigos.", "validacao")
    lim = sorted({c.strip() for c in codigos if isinstance(c, str) and 0 < len(c.strip()) <= 20})
    if not lim:
        return []
    rows = get_db().dominiotuss.find_many(where={"codigoTermo": {"in": lim}, "ativo": True}, take=5000)
    return sorted({r.codigoTermo for r in rows})


class handler(ApiHandler):
    def get(self, ctx):
        p = ctx.exigir()
        codigo = (ctx.query.get("codigo") or "").strip()[:20]
        termo = (ctx.query.get("termo") or "").strip()[:100]
        if not codigo and len(termo) < 3:
            raise ApiError(422, "Informe um código ou ao menos 3 letras da descrição.", "validacao")
        where = {}
        if ctx.query.get("tabela"):
            where["codigoTabela"] = v.escolha(ctx.query["tabela"], config.TABELAS_TUSS, "Tabela")
        if codigo:
            where["codigoTermo"] = {"starts_with": codigo}
        if termo:
            where["termo"] = {"contains": termo, "mode": "insensitive"}
        if p.tipo != "INTERNO":
            where["ativo"] = True
        rows = get_db().dominiotuss.find_many(where=where, take=50, order={"codigoTermo": "asc"})
        return [_item(r) for r in rows]

    def post(self, ctx):
        d = ctx.json()
        acao = d.get("acao")
        if acao == "validar_lote":            # público (a tabela TUSS é pública); só leitura, até 500 códigos por chamada
            return {"validos": _validar_lote(d.get("codigos"))}
        p = ctx.exigir(tipo="INTERNO", permissao="tuss:editar")
        db = get_db()
        reg = db.dominiotuss.find_unique(where={"id": str(d.get("id") or "")})
        if not reg:
            raise ApiError(404, "Registro não encontrado.")
        if acao in ("excluir", "reativar"):
            ativo = acao == "reativar"
            db.dominiotuss.update(where={"id": reg.id}, data={"ativo": ativo})
            audit.registrar(db, p, "TUSS_" + acao.upper(), "TUSS", reg.id, {"codigo": reg.codigoTermo}, ctx.ip)
            return {"sucesso": True}
        if acao == "editar":
            data = {
                "codigoTabela": v.escolha(d.get("codigoTabela"), config.TABELAS_TUSS, "Tabela"),
                "codigoTermo": v.texto(d.get("codigoTermo"), "Código", 1, 20),
                "termo": v.texto(d.get("termo"), "Termo", 1, 500),
                "registroAnvisa": v.texto(d.get("registroAnvisa"), "Registro ANVISA", 0, 50, False) or None,
                "fabricante": v.texto(d.get("fabricante"), "Fabricante", 0, 200, False) or None,
                "apresentacaoModelo": v.texto(d.get("apresentacaoModelo"), "Apresentação/Modelo", 0, 300, False) or None,
                "classeRisco": v.texto(d.get("classeRisco"), "Classe de risco", 0, 20, False) or None}
            db.dominiotuss.update(where={"id": reg.id}, data=data)
            audit.registrar(db, p, "TUSS_EDITAR", "TUSS", reg.id, {"codigo": data["codigoTermo"]}, ctx.ip)
            return {"sucesso": True}
        raise ApiError(400, "Ação desconhecida.")
