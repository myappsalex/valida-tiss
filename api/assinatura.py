"""/api/assinatura – ajuste manual de plano (staff).

Corrige: sem autenticação (qualquer um virava PREMIUM); atualizava `db.usuario`
(tabela de funcionários) em vez de `db.cliente`; sem validação nem auditoria.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import audit, config, validation as v
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler


class handler(ApiHandler):
    def post(self, ctx):
        p = ctx.exigir(tipo="INTERNO", permissao="assinatura:editar")
        c = ctx.json()
        plano = v.escolha(c.get("plano"), config.PLANOS, "Plano")
        status = v.escolha(c.get("statusPagamento"), config.STATUS_PAGAMENTO, "Status do pagamento")
        db = get_db()
        antes = db.cliente.find_unique(where={"id": str(c.get("id") or "")})
        if not antes:
            raise ApiError(404, "Cliente não encontrado.")
        data = {"plano": plano, "statusPagamento": status}
        if plano == "PREMIUM" and c.get("planoValidoAte"):
            data["planoValidoAte"] = v.data_iso(c["planoValidoAte"], "Validade do plano", fim_do_dia=True)
        db.cliente.update(where={"id": antes.id}, data=data)
        audit.registrar(db, p, "ASSINATURA_ALTERADA", "CLIENTE", antes.id,
                        {"antes": [getattr(antes, "plano", None), getattr(antes, "statusPagamento", None)],
                         "depois": [plano, status]}, ctx.ip)
        return {"sucesso": True, "mensagem": "Assinatura atualizada."}
