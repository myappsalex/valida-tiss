"""/api/banner?id= – serve a arte do anúncio (PNG/JPEG validado no upload). ATIVO = público;
os demais status só para o dono e a equipe de publicidade."""
import base64
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler, Resposta


class handler(ApiHandler):
    def get(self, ctx):
        c = get_db().campanhaads.find_unique(where={"id": ctx.query.get("id", "")})
        if not c or not c.bannerDados or c.bannerMime not in ("image/png", "image/jpeg"):
            raise ApiError(404, "Imagem não encontrada.")
        publico = c.status == "ATIVO"
        if not publico:  # arte ainda não aprovada: só o dono ou a equipe de publicidade enxergam
            p = ctx.principal()
            dono = p is not None and p.tipo == "CLIENTE" and p.id == c.usuarioId
            equipe = p is not None and p.tipo == "INTERNO" and p.pode("ads:ler")
            if not (dono or equipe):
                raise ApiError(404, "Imagem não encontrada.")
        return Resposta(200, base64.b64decode(c.bannerDados), c.bannerMime, {
            "Cache-Control": "public, max-age=3600" if publico else "private, no-store",
            "Content-Security-Policy": "default-src 'none'; sandbox"})
