"""Cliente AbacatePay (PIX v2). Substitui Asaas com menor custo e QR Code na mesma chamada."""
import sys
import requests
from . import config
from .web import ApiError

TIMEOUT = (5, 20)

def _base():
    chave = config.env("ABACATEPAY_API_KEY")
    if not chave:
        raise ApiError(503, "Gateway AbacatePay não configurado.", "pagamento_indisponivel")
    return "https://api.abacatepay.com/v2", {
        "accept": "application/json", 
        "content-type": "application/json",
        "Authorization": f"Bearer {chave}"
    }

def criar_cobranca_pix(nome, email, cpf_cnpj, valor, descricao, referencia):
    """Cria a cobrança PIX via checkout transparente v2 em uma única chamada."""
    base, headers = _base()
    
    # AbacatePay exige valores em centavos inteiros (ex: R$ 10,50 -> 1050)
    valor_centavos = int(round(float(valor) * 100))
    
    payload = {
        "method": "PIX",
        "data": {
            "amount": valor_centavos,
            "description": descricao[:255],
            "customer": {
                "name": nome or "Cliente ValidaTISS",
                "email": email or "contato@validatiss.com",
                "taxId": cpf_cnpj or ""
            },
            "metadata": {
                "referencia": referencia
            }
        }
    }
    
    try:
        r = requests.post(f"{base}/transparents/create", headers=headers, json=payload, timeout=TIMEOUT)
    except requests.RequestException as exc:
        print(f"[abacatepay] POST /transparents/create: {type(exc).__name__}", file=sys.stderr)
        raise ApiError(502, "Gateway de pagamento indisponível. Tente novamente.", "gateway")
        
    if r.status_code >= 400:
        print(f"[abacatepay] Erro {r.status_code}: {r.text[:300]}", file=sys.stderr)
        raise ApiError(502, "O gateway recusou a geração do PIX.", "gateway")
        
    d = r.json()
    if not d.get("success"):
        raise ApiError(502, "Erro ao gerar PIX na plataforma.", "gateway")
        
    dados = d.get("data", {})
    return {
        "id": dados.get("id"),
        "payload_pix": dados.get("brCode"),
        "imagem_qrcode": dados.get("brCodeBase64")
    }

def cancelar_cobranca(payment_id):
    """Na AbacatePay o PIX expira sozinho. Mantido para compatibilidade de interface."""
    pass