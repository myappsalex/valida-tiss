"""
Corrige: POST de editar/excluir sem autenticação; `acao` desconhecida não
respondia nada; exclusão física (agora inativa, reversível e auditada); busca
sem filtro de tabela, `contains` por código (varredura) e sem paginação.
"""
"""/api/dominio_tuss – consulta (logado), validação de XML (público) e manutenção (staff)."""

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
            where["codigoTermo"] = {"startswith": codigo}
        if termo:
            where["termo"] = {"contains": termo, "mode": "insensitive"}
        if p.tipo != "INTERNO":
            where["ativo"] = True
        rows = get_db().dominiotuss.find_many(where=where, take=50, order={"codigoTermo": "asc"})
        return [_item(r) for r in rows]

    def post(self, ctx):
        d = ctx.json()
        acao = d.get("acao")
        db = get_db()
        
        # ---------------------------------------------------------------------
        # RECURSO INTEGRADO: Validação em Lote para o Front-end (Check Verde/Vermelho)
        # ---------------------------------------------------------------------
        if acao == "validar_lote":
            codigos_para_validar = d.get("codigos")
            if not isinstance(codigos_para_validar, list) or not codigos_para_validar:
                return []
            
            # Limita a quantidade para evitar abusos no banco (1000 por requisição)
            codigos_para_validar = [str(c) for c in codigos_para_validar[:1000]]
            
            encontrados = db.dominiotuss.find_many(
                where={"codigoTermo": {"in": codigos_para_validar}},
                select={"codigoTermo": True}
            )
            return [item.codigoTermo for item in encontrados]

        # ---------------------------------------------------------------------
        # Ações Administrativas (Restritas a Staff)
        # ---------------------------------------------------------------------
        p = ctx.exigir(tipo="INTERNO", permissao="tuss:editar")
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
        