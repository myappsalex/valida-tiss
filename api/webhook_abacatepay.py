"""/api/webhook_abacatepay – confirmação de pagamento."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import timedelta
from vt_core import config, security, settings
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler

def _log(msg):
    print(f"[webhook_abacatepay] {msg}", file=sys.stderr)

class handler(ApiHandler):
    exige_origem_em_post = False  # chamada servidor-a-servidor

    def post(self, ctx):
        esperado = config.env("ABACATEPAY_WEBHOOK_SECRET")
        if not esperado:
            raise ApiError(503, "Webhook AbacatePay não configurado.")
            
        # A AbacatePay geralmente envia o secret no header Authorization (Bearer) ou num header próprio.
        # Vamos buscar no Authorization (padrão mais comum deles):
        auth_header = ctx.header("authorization") or ""
        recebido = auth_header.replace("Bearer ", "").strip()
        
        # Valida se o secret recebido no header bate com o da Vercel
        if not security.comparar_seguro(recebido, esperado):
            raise ApiError(401, "Não autorizado.")
            
        corpo = ctx.json(limite=100 * 1024)
        evento = corpo.get("event")
        
        # Ignora tudo que não for confirmação de pagamento de checkout transparente
        if evento != "transparent.completed":
            return {"recebido": True, "ignorado": str(evento)[:60]}
            
        dados = corpo.get("data") or {}
        pid = str(dados.get("id") or "")
        
        # AbacatePay envia valor em centavos
        valor = round(float(dados.get("amount") or 0) / 100.0, 2)
        
        metadata = dados.get("metadata") or {}
        ref = str(metadata.get("referencia") or "")
        
        if not pid or not ref:
            return {"recebido": True, "ignorado": "sem id/referência"}

        db = get_db()
        agora = security.agora_utc()
        with db.tx() as tx:
            try:  # Idempotência: Evita processar o mesmo webhook duas vezes
                tx.pagamentoprocessado.create(data={"id": pid, "referencia": ref[:100], "valor": valor})
            except Exception as exc:
                if type(exc).__name__ == "UniqueViolationError":
                    return {"recebido": True, "duplicado": True}
                raise

            # Lógica de renovação de Assinatura
            if ref.startswith("ASSINATURA_"):
                partes = ref.split("_", 2)
                plano, cli_id = partes[1], partes[2] if len(partes) == 3 else "PREMIUM", ref[len("ASSINATURA_"):]
                    
                cli = tx.cliente.find_unique(where={"id": cli_id})
                if not cli:
                    _log(f"Cliente {cli_id} não encontrado.")
                    return {"recebido": True, "ignorado": "divergente"}
                
                base = max(agora, security._aware(getattr(cli, "planoValidoAte", None)) or agora)
                
                # 1. Libera o cadastro do cliente
                tx.cliente.update(where={"id": cli.id}, data={
                    "plano": plano, 
                    "statusPagamento": "ATIVO",
                    "planoValidoAte": base + timedelta(days=30)
                })
                
                # 2. Registra o recibo financeiro
                tx.mensalidade.create(data={
                    "clienteId": cli.id,
                    "mesRef": agora.strftime("%m/%Y"),
                    "vencimento": agora,
                    "dataPagamento": agora,
                    "valorBase": valor,
                    "status": "PAGO"
                })
            else:
                _log(f"Referência desconhecida ou módulo em desenvolvimento: {ref}")
                
        return {"recebido": True}