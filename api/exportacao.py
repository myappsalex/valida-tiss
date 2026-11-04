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
    
    def _get_limites(db):
    # Busca dinamicamente os limites na tabela de domínio
    planos = db.configuracaoplano.find_many()
    if not planos:
        return {"ECO": 1, "FLEX": 5, "PREMIUM": 9999}
    return {p.nome: p.limite for p in planos}
    
    def post(ctx):
    cli = ctx.usuario
    if not cli or cli.tipo != "CLIENTE":
        raise web.ApiError(401, "Acesso negado.")
        
    corpo = ctx.corpo
    # Espera receber 'codigoPrestador' do frontend (que extraiu do XML)
    codigo_prestador = corpo.get("codigoPrestador", "").strip()
    if not codigo_prestador:
        raise web.ApiError(400, "Identificação do prestador (CNPJ ou Código) ausente no XML.")
        
    db = get_db()
    cliente_db = db.cliente.find_unique(where={"id": cli.id})
    plano = cliente_db.plano
    
    if plano == "FREEMIUM":
        raise web.ApiError(402, "Assine um plano para exportar o arquivo corrigido.", "assinar_plano")

    # Verifica se há mensalidade ativa e no prazo
    mensalidade_ativa = db.mensalidade.find_first(
        where={
            "clienteId": cli.id, 
            "status": "PAGO", 
            "dataPagamento": {"gte": datetime.now() - timedelta(days=30)}
        }
    )
    if not mensalidade_ativa:
        raise web.ApiError(402, "Sua assinatura está inativa ou a última mensalidade venceu.", "pagar_mensalidade")

    # Controle de Limite de CNPJ/Código
    limites = _get_limites(db)
    limite_atual = limites.get(plano, 0)
    
    ja_vinculado = db.prestadorvinculado.find_unique(
        where={"clienteId_codigo": {"clienteId": cli.id, "codigo": codigo_prestador}}
    )
    
    if not ja_vinculado:
        if cliente_db.qtdPrestadoresUsados >= limite_atual:
            raise web.ApiError(403, f"Limite de {limite_atual} prestador(es) atingido para o plano {plano}. Faça upgrade para adicionar novos.")
            
        # Grava o vínculo de forma atômica
        db.prestadorvinculado.create(data={
            "clienteId": cli.id,
            "codigo": codigo_prestador,
            "planoRef": plano
        })
        db.cliente.update(where={"id": cli.id}, data={"qtdPrestadoresUsados": {"increment": 1}})

    return {"sucesso": True, "autorizado": True}
