"""/api/gerar_pix – cobrança PIX para anúncios, tokens e assinatura.

Refatorado para utilizar a AbacatePay como gateway de pagamento principal,
reduzindo a latência (sem necessidade de criar customer id prévio) e evitando 
arredondamentos indevidos.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import abacatepay, config, security, settings, validation as v
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler


class handler(ApiHandler):
    def get(self, ctx):
        """Preços vigentes (só para exibir na tela; o valor cobrado é recalculado no POST)."""
        ctx.exigir(tipo="CLIENTE")
        db = get_db()
        return (200, {"precoToken": settings.obter(db, "PRECO_TOKEN"), "premiumMensal": settings.obter(db, "PRECO_PREMIUM_MENSAL"),
                      "tokensMin": config.TOKENS_MIN, "tokensMax": config.TOKENS_MAX}, {"Cache-Control": "no-store"})

    def post(self, ctx):
        p = ctx.exigir(tipo="CLIENTE")
        d = ctx.json()
        tipo = v.escolha(d.get("tipo"), ("AD", "ASSINATURA", "TOKENS"), "Tipo")
        db = get_db()
        doc_cpf = getattr(p.rec, "cpfCnpj", None) or d.get("cpfCnpj") or ""
        
        if not doc_cpf:
            raise ApiError(422, "Informe o CPF/CNPJ para gerar a cobrança.", "cpf_cnpj_necessario")

        if tipo == "AD":
            camp = db.campanhaads.find_first(where={"id": str(d.get("id") or ""), "usuarioId": p.id})
            if not camp:
                raise ApiError(404, "Pedido não encontrado.")
            if camp.status not in ("ORCADO", "AGUARDANDO_PAGAMENTO") or (camp.valorOrcamento or 0) <= 0:
                raise ApiError(409, "Este pedido não está aguardando pagamento.", "estado")
                
            valor = round(float(camp.valorOrcamento), 2)
            ref_externa = f"AD_{camp.id}"
            
            pix = abacatepay.criar_cobranca_pix(
                nome=p.rec.nomeEmpresa, 
                email=p.rec.emailAcesso, 
                cpf_cnpj=doc_cpf, 
                valor=valor, 
                descricao="Anúncio ValidaTISS", 
                referencia=ref_externa
            )
            
            n = db.campanhaads.update_many(
                where={"id": camp.id, "status": {"in": ["ORCADO", "AGUARDANDO_PAGAMENTO"]}},
                data={"status": "AGUARDANDO_PAGAMENTO", "asaasPaymentId": pix["id"]})
            if n == 0:
                raise ApiError(409, "O pedido mudou de estado. Atualize a página.", "estado")
                
            return {"sucesso": True, "valor": valor, "cobrancaId": pix["id"], 
                    "payload_pix": pix["payload_pix"], "imagem_qrcode": pix["imagem_qrcode"]}

        if tipo == "TOKENS":
            preco_tok = settings.obter(db, "PRECO_TOKEN")
            if not preco_tok:
                raise ApiError(503, "Compra de tokens indisponível no momento.", "indisponivel")
                
            qtd = v.inteiro(d.get("quantidade"), "Quantidade", config.TOKENS_MIN, config.TOKENS_MAX)
            valor = round(qtd * preco_tok, 2)
            if valor < 1:
                raise ApiError(422, "Valor mínimo da cobrança: R$ 1,00.", "validacao")
                
            if db.compratokens.count(where={"clienteId": p.id, "status": "AGUARDANDO"}) >= 5:
                raise ApiError(429, "Você já tem 5 compras aguardando pagamento. Pague ou aguarde a expiração.", "limite")
                
            compra = db.compratokens.create(data={"clienteId": p.id, "quantidade": qtd, "valor": valor})
            ref_externa = f"TOK_{compra.id}"
            
            try:
                pix = abacatepay.criar_cobranca_pix(
                    nome=p.rec.nomeEmpresa, 
                    email=p.rec.emailAcesso, 
                    cpf_cnpj=doc_cpf, 
                    valor=valor, 
                    descricao=f"{qtd} tokens de IA ValidaTISS", 
                    referencia=ref_externa
                )
            except ApiError:
                db.compratokens.update(where={"id": compra.id}, data={"status": "CANCELADO"})
                raise
                
            db.compratokens.update(where={"id": compra.id}, data={"asaasPaymentId": pix["id"]})
            
            return {"sucesso": True, "valor": valor, "quantidade": qtd, "cobrancaId": pix["id"], 
                    "payload_pix": pix["payload_pix"], "imagem_qrcode": pix["imagem_qrcode"]}

        if tipo == "ASSINATURA":
            plano = v.escolha(d.get("plano", "PREMIUM"), ["ECO", "FLEX", "PREMIUM"], "Plano")
            hoje = security.agora_utc()
            
            try:
                planos_db = db.configuracaoplano.find_many(
                    where={"nome": plano, "vigenciaInicio": {"lte": hoje}}, 
                    order={"vigenciaInicio": "desc"}, take=1
                )
                preco = planos_db[0].valor if planos_db else None
            except Exception:
                preco = None
                
            if not preco: 
                preco = settings.obter(db, "PRECO_PREMIUM_MENSAL") if plano == "PREMIUM" else (99.90 if plano == "ECO" else 199.90)
                    
            if not preco or preco <= 0:
                raise ApiError(503, "Assinatura online indisponível no momento.", "indisponivel")
                
            valor = round(float(preco), 2)
            ref_externa = f"ASSINATURA_{plano}_{p.id}"
            
            pix = abacatepay.criar_cobranca_pix(
                nome=p.rec.nomeEmpresa, 
                email=p.rec.emailAcesso, 
                cpf_cnpj=doc_cpf, 
                valor=valor, 
                descricao=f"Assinatura {plano} ValidaTISS", 
                referencia=ref_externa
            )
            
            return {"sucesso": True, "valor": valor, "cobrancaId": pix["id"], 
                    "payload_pix": pix["payload_pix"], "imagem_qrcode": pix["imagem_qrcode"]}