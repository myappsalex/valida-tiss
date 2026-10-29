"""/api/webhook_asaas – confirmação de pagamento.

Corrige: webhook sem autenticação (qualquer um forjava PAYMENT_RECEIVED); os
updates estavam comentados e o de assinatura apontava para `usuario` em vez de
`cliente`; sem idempotência (reentrega estenderia o plano duas vezes); sem
conferência de valor e de vínculo cobrança<->pedido.
Configure no Asaas o "token de autenticação" do webhook = ASAAS_WEBHOOK_TOKEN.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import timedelta

from vt_core import config, security, settings
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler

EVENTOS_PAGO = ("PAYMENT_RECEIVED", "PAYMENT_CONFIRMED")


def _log(msg):
    print(f"[webhook_asaas] {msg}", file=sys.stderr)


class handler(ApiHandler):
    exige_origem_em_post = False  # chamada servidor-a-servidor

    def post(self, ctx):
        esperado = config.env("ASAAS_WEBHOOK_TOKEN")
        if not esperado:
            _log("ASAAS_WEBHOOK_TOKEN não configurado")
            raise ApiError(503, "Webhook não configurado.")
        if not security.comparar_seguro(ctx.header("asaas-access-token"), esperado):
            raise ApiError(401, "Não autorizado.")
        corpo = ctx.json(limite=100 * 1024)
        evento, pg = corpo.get("event"), corpo.get("payment") or {}
        if evento not in EVENTOS_PAGO:
            return {"recebido": True, "ignorado": str(evento)[:60]}
        pid, ref = str(pg.get("id") or ""), str(pg.get("externalReference") or "")
        try:
            valor = round(float(pg.get("value") or 0), 2)
        except (TypeError, ValueError):
            valor = 0.0
        if not pid or not ref:
            return {"recebido": True, "ignorado": "sem id/referência"}

        db = get_db()
        agora = security.agora_utc()
        with db.tx() as tx:
            try:  # idempotência atômica: PK = id da cobrança
                tx.pagamentoprocessado.create(data={"id": pid, "referencia": ref[:100], "valor": valor})
            except Exception as exc:
                if type(exc).__name__ == "UniqueViolationError":
                    return {"recebido": True, "duplicado": True}
                raise
            if ref.startswith("AD_"):
                camp = tx.campanhaads.find_unique(where={"id": ref[3:]})
                if not camp or camp.asaasPaymentId != pid or abs((camp.valorOrcamento or 0) - valor) > 0.01:
                    _log(f"AD divergente ref={ref} pid={pid} valor={valor}")
                    return {"recebido": True, "ignorado": "divergente"}
                tx.campanhaads.update_many(
                    where={"id": camp.id, "status": {"in": ["ORCADO", "AGUARDANDO_PAGAMENTO"]}},
                    data={"status": "ATIVO", "pagoEm": agora,
                          "dataInicio": camp.dataInicio or agora,
                          "dataFim": camp.dataFim or (agora + timedelta(days=30))})
            elif ref.startswith("TOK_"):
                compra = tx.compratokens.find_unique(where={"id": ref[4:]})
                if not compra or compra.asaasPaymentId != pid or abs(compra.valor - valor) > 0.01:
                    _log(f"TOKENS divergente ref={ref} pid={pid} valor={valor}")
                    return {"recebido": True, "ignorado": "divergente"}
                if tx.compratokens.update_many(where={"id": compra.id, "status": "AGUARDANDO"},
                                               data={"status": "PAGO", "pagoEm": agora}):
                    tx.cliente.update(where={"id": compra.clienteId}, data={"tokensIA": {"increment": compra.quantidade}})
            elif ref.startswith("ASSINATURA_"):
                preco = settings.piso_aceito(tx, "PRECO_PREMIUM_MENSAL") or 0
                cli = tx.cliente.find_unique(where={"id": ref[len("ASSINATURA_"):]})
                if not cli or preco <= 0 or valor + 0.01 < preco:
                    _log(f"ASSINATURA divergente ref={ref} pid={pid} valor={valor}")
                    return {"recebido": True, "ignorado": "divergente"}
                base = max(agora, security._aware(getattr(cli, "planoValidoAte", None)) or agora)
                tx.cliente.update(where={"id": cli.id}, data={
                    "plano": "PREMIUM", "statusPagamento": "ATIVO",
                    "planoValidoAte": base + timedelta(days=30)})
            else:
                _log(f"referência desconhecida {ref[:40]}")
        return {"recebido": True}
