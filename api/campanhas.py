"""/api/campanhas – anúncios ativos (público, com cache de borda).

Corrige: filtro de datas feito em Python; resposta sem cache (um acesso ao
banco por visita); sem `id`; só o primeiro anúncio de cada local era usado.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core.db import get_db
from vt_core.security import agora_utc
from vt_core.web import ApiHandler


class handler(ApiHandler):
    def get(self, ctx):
        agora = agora_utc()
        rows = get_db().campanhaads.find_many(
            where={"status": "ATIVO",
                   "OR": [{"dataInicio": None}, {"dataInicio": {"lte": agora}}],
                   "AND": [{"OR": [{"dataFim": None}, {"dataFim": {"gte": agora}}]}]},
            take=50)
        lista = [{"id": c.id, "titulo": c.empresa_nome, "texto": c.tema,
                  "link": c.link_destino or "", "banner": c.bannerUrl or "",
                  "local": c.localExibicao or "CABECALHO"} for c in rows]
        return (200, lista, {"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"})
