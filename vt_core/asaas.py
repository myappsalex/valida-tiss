"""Cliente Asaas (PIX). Sempre com timeout; nunca repassa o corpo de erro ao usuário."""
import sys
from datetime import datetime, timedelta

import requests

from . import config
from .web import ApiError

TIMEOUT = (5, 20)


def _base():
    url = config.env("ASAAS_API_URL")
    chave = config.env("ASAAS_API_KEY")
    if not url or not chave:
        raise ApiError(503, "Pagamentos não configurados.", "pagamento_indisponivel")
    return url.rstrip("/"), {"accept": "application/json", "content-type": "application/json",
                              "access_token": chave}


def _chamar(metodo, caminho, **kw):
    base, headers = _base()
    try:
        r = requests.request(metodo, base + caminho, headers=headers, timeout=TIMEOUT, **kw)
    except requests.RequestException as exc:
        print(f"[asaas] {metodo} {caminho}: {type(exc).__name__}", file=sys.stderr)
        raise ApiError(502, "Gateway de pagamento indisponível. Tente novamente.", "gateway")
    if r.status_code >= 400:
        print(f"[asaas] {metodo} {caminho} -> {r.status_code}: {r.text[:300]}", file=sys.stderr)
        raise ApiError(502, "O gateway recusou a operação.", "gateway")
    return r.json()


def criar_cliente(nome, email, cpf_cnpj):
    return _chamar("POST", "/customers", json={"name": nome, "email": email, "cpfCnpj": cpf_cnpj})["id"]


def criar_cobranca_pix(customer_id, valor, descricao, referencia, vencimento=None):
    venc = vencimento or (datetime.utcnow() - timedelta(hours=3) + timedelta(days=1)).strftime("%Y-%m-%d")
    return _chamar("POST", "/payments", json={
        "customer": customer_id, "billingType": "PIX", "value": round(float(valor), 2),
        "dueDate": venc, "description": descricao, "externalReference": referencia})


def obter_qrcode(payment_id):
    d = _chamar("GET", f"/payments/{payment_id}/pixQrCode")
    return {"payload_pix": d.get("payload"), "imagem_qrcode": d.get("encodedImage"),
            "expiracao": d.get("expirationDate")}


def cancelar_cobranca(payment_id):
    try:
        _chamar("DELETE", f"/payments/{payment_id}")
    except ApiError:
        pass  # melhor esforço
