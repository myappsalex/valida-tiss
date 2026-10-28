"""/api/exportacao – autoriza o download do XML corrigido (degustação FREEMIUM no servidor).

Antes: o contador vivia no sessionStorage (apagar o storage = exportações infinitas).
Agora: PREMIUM vigente = ilimitado; FREEMIUM consome 1 crédito de forma atômica.
Limite honesto: o XML é gerado no navegador, então isto controla o fluxo oficial, não
impede quem remonte o arquivo manualmente. Para bloqueio real, gerar o XML no servidor.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import security
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler


class handler(ApiHandler):
    def get(self, ctx):
        p = ctx.exigir(tipo="CLIENTE")
        return {"plano": security.plano_efetivo(p.rec), "restantes": getattr(p.rec, "exportacoesGratis", 0)}

    def post(self, ctx):
        p = ctx.exigir(tipo="CLIENTE")
        if p.rec.statusConta != "ATIVO":
            raise ApiError(403, "Conta inativa.", "conta_inativa")
        if security.plano_efetivo(p.rec) == "PREMIUM":
            return {"permitido": True, "ilimitado": True, "restantes": None}
        db = get_db()
        if db.cliente.update_many(where={"id": p.id, "exportacoesGratis": {"gte": 1}},
                                  data={"exportacoesGratis": {"decrement": 1}}) == 0:
            raise ApiError(402, "Você usou as exportações gratuitas. Assine o Premium para exportar sem limite.", "limite_freemium")
        return {"permitido": True, "ilimitado": False, "restantes": db.cliente.find_unique(where={"id": p.id}).exportacoesGratis}
