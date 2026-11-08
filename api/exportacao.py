"""/api/exportacao – autoriza o download do XML corrigido (degustação FREEMIUM no servidor).

Antes: o contador vivia no sessionStorage (apagar o storage = exportações infinitas).
Agora: PREMIUM vigente = ilimitado; FREEMIUM consome 1 crédito de forma atômica.
Limite honesto: o XML é gerado no navegador, então isto controla o fluxo oficial, não
impede quem remonte o arquivo manualmente. Para bloqueio real, gerar o XML no servidor.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import security, web, config
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler
from datetime import datetime, timedelta
import urllib.request
import json

class handler(ApiHandler):
    def get(self, ctx):
        p = ctx.exigir(tipo="CLIENTE")
        return {"plano": security.plano_efetivo(p.rec), "restantes": getattr(p.rec, "exportacoesGratis", 0)}

    def _get_limites(self, db):
        planos = db.configuracaoplano.find_many()
        if not planos:
            return {"ECO": 1, "FLEX": 5, "PREMIUM": 9999}
        return {p.nome: p.limite for p in planos}

    def post(self, ctx):
        p = ctx.exigir(tipo="CLIENTE")
        if p.rec.statusConta != "ATIVO":
            raise ApiError(403, "Conta inativa.", "conta_inativa")
            
        corpo = ctx.json()
        codigo_prestador = corpo.get("codigoPrestador", "").strip()
        if not codigo_prestador:
            raise ApiError(400, "Identificação do prestador (CNPJ ou Código) ausente no XML.")

        db = get_db()
        cliente_db = db.cliente.find_unique(where={"id": p.id})
        plano = security.plano_efetivo(cliente_db)

        # Lógica 1: Degustação FREEMIUM
        if plano == "FREEMIUM":
            if db.cliente.update_many(where={"id": p.id, "exportacoesGratis": {"gte": 1}},
                                      data={"exportacoesGratis": {"decrement": 1}}) == 0:
                raise ApiError(402, "Você usou as exportações gratuitas. Assine um plano para exportar sem limite.", "assinar_plano")
            return {"sucesso": True, "autorizado": True, "ilimitado": False, "restantes": cliente_db.exportacoesGratis - 1}

        # Lógica 2: Assinantes (ECO, FLEX, PREMIUM)
        # Verifica se há mensalidade ativa e no prazo
        agora = security.agora_utc()
        mensalidade_ativa = db.mensalidade.find_first(
            where={
                "clienteId": p.id, 
                "status": "PAGO", 
                "dataPagamento": {"gte": agora - timedelta(days=30)}
            }
        )
        if not mensalidade_ativa and plano != "PREMIUM": # Premium usa planoValidoAte como fallback principal
            raise ApiError(402, "Sua assinatura está inativa ou a última mensalidade venceu.", "pagar_mensalidade")

        if plano == "PREMIUM":
            return {"sucesso": True, "autorizado": True, "ilimitado": True, "restantes": None}

        # Lógica 3: Trava de CNPJs (ECO e FLEX)
        limites = self._get_limites(db)
        limite_atual = limites.get(plano, 0)
        
        ja_vinculado = db.prestadorvinculado.find_unique(
            where={"clienteId_codigo": {"clienteId": p.id, "codigo": codigo_prestador}}
        )
        
        if not ja_vinculado:
            if cliente_db.qtdPrestadoresUsados >= limite_atual:
                raise ApiError(403, f"Limite de {limite_atual} prestador(es) atingido para o plano {plano}. Faça upgrade para adicionar novos.")
                
            db.prestadorvinculado.create(data={
                "clienteId": p.id,
                "codigo": codigo_prestador,
                "planoRef": plano
            })
            db.cliente.update(where={"id": p.id}, data={"qtdPrestadoresUsados": {"increment": 1}})

        return {"sucesso": True, "autorizado": True}
