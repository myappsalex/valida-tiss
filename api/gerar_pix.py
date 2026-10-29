"""/api/gerar_pix – cobrança PIX para anúncio aprovado ou assinatura Premium.

Corrige: valor, cliente Asaas e referência vinham do navegador (dava para pagar
R$ 0,01 por um anúncio de R$ 500 e vincular o pagamento a outro registro); sem
autenticação; sem timeout; tela de PIX no front era um QR falso (Google Charts,
descontinuado). Aqui o VALOR é sempre lido do banco/config.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import asaas, config, validation as v
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler


def _garantir_cliente_asaas(db, cliente, cpf_cnpj_informado):
    if getattr(cliente, "asaasCustomerId", None):
        return cliente.asaasCustomerId
    doc = getattr(cliente, "cpfCnpj", None) or None
    if not doc:
        if not cpf_cnpj_informado:
            raise ApiError(422, "Informe o CPF/CNPJ para gerar a cobrança.", "cpf_cnpj_necessario")
        doc = v.cpf_cnpj(cpf_cnpj_informado)
    cid = asaas.criar_cliente(cliente.nomeEmpresa, cliente.emailAcesso, doc)
    db.cliente.update(where={"id": cliente.id}, data={"asaasCustomerId": cid, "cpfCnpj": doc})
    return cid


class handler(ApiHandler):
    def post(self, ctx):
        p = ctx.exigir(tipo="CLIENTE")
        d = ctx.json()
        tipo = v.escolha(d.get("tipo"), ("AD", "ASSINATURA", "TOKENS"), "Tipo")
        db = get_db()

        if tipo == "AD":
            camp = db.campanhaads.find_first(where={"id": str(d.get("id") or ""), "usuarioId": p.id})
            if not camp:
                raise ApiError(404, "Pedido não encontrado.")
            if camp.status not in ("ORCADO", "AGUARDANDO_PAGAMENTO") or (camp.valorOrcamento or 0) <= 0:
                raise ApiError(409, "Este pedido não está aguardando pagamento.", "estado")
            valor = round(float(camp.valorOrcamento), 2)
            if camp.status == "AGUARDANDO_PAGAMENTO" and camp.asaasPaymentId:
                pix = asaas.obter_qrcode(camp.asaasPaymentId)  # idempotente: reaproveita a cobrança
                return {"sucesso": True, "valor": valor, "cobrancaId": camp.asaasPaymentId, **pix}
            cid = _garantir_cliente_asaas(db, p.rec, d.get("cpfCnpj"))
            cob = asaas.criar_cobranca_pix(cid, valor, "Anúncio ValidaTISS", f"AD_{camp.id}")
            n = db.campanhaads.update_many(
                where={"id": camp.id, "status": {"in": ["ORCADO", "AGUARDANDO_PAGAMENTO"]}},
                data={"status": "AGUARDANDO_PAGAMENTO", "asaasPaymentId": cob["id"]})
            if n == 0:
                raise ApiError(409, "O pedido mudou de estado. Atualize a página.", "estado")
            return {"sucesso": True, "valor": valor, "cobrancaId": cob["id"], **asaas.obter_qrcode(cob["id"])}

        if tipo == "TOKENS":
            preco_tok = config.env("PRECO_TOKEN", "0.15")
            try:
                preco_tok = float(preco_tok)
            except ValueError:
                raise ApiError(503, "Compra de tokens indisponível no momento.", "indisponivel")
            qtd = v.inteiro(d.get("quantidade"), "Quantidade", config.TOKENS_MIN, config.TOKENS_MAX)
            valor = round(qtd * preco_tok, 2)          # o valor é SEMPRE calculado aqui, nunca vem do navegador
            if valor < 1:
                raise ApiError(422, "Valor mínimo da cobrança: R$ 1,00.", "validacao")
            if db.compratokens.count(where={"clienteId": p.id, "status": "AGUARDANDO"}) >= 5:
                raise ApiError(429, "Você já tem 5 compras aguardando pagamento. Pague ou aguarde a expiração.", "limite")
            cid = _garantir_cliente_asaas(db, p.rec, d.get("cpfCnpj"))
            compra = db.compratokens.create(data={"clienteId": p.id, "quantidade": qtd, "valor": valor})
            try:
                cob = asaas.criar_cobranca_pix(cid, valor, f"{qtd} tokens de IA ValidaTISS", f"TOK_{compra.id}")
            except ApiError:
                db.compratokens.update(where={"id": compra.id}, data={"status": "CANCELADO"})
                raise
            db.compratokens.update(where={"id": compra.id}, data={"asaasPaymentId": cob["id"]})
            return {"sucesso": True, "valor": valor, "quantidade": qtd, "cobrancaId": cob["id"], **asaas.obter_qrcode(cob["id"])}

        preco = config.env("PRECO_PREMIUM_MENSAL")
        if not preco:
            raise ApiError(503, "Assinatura online indisponível no momento.", "indisponivel")
        valor = round(float(preco), 2)
        cid = _garantir_cliente_asaas(db, p.rec, d.get("cpfCnpj"))
        cob = asaas.criar_cobranca_pix(cid, valor, "Assinatura Premium ValidaTISS", f"ASSINATURA_{p.id}")
        return {"sucesso": True, "valor": valor, "cobrancaId": cob["id"], **asaas.obter_qrcode(cob["id"])}
