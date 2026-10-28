"""Validação e sanitização de entrada (o original não validava nada no servidor)."""
import base64
import binascii
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

from .web import ApiError

_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_EMAIL = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}$")


def _erro(msg):
    return ApiError(422, msg, "validacao")


def texto(valor, campo, minimo=1, maximo=255, obrigatorio=True):
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        if obrigatorio:
            raise _erro(f"{campo} é obrigatório.")
        return ""
    if not isinstance(valor, str):
        raise _erro(f"{campo} inválido.")
    v = _CTRL.sub("", valor).strip()
    if len(v) < minimo:
        raise _erro(f"{campo} deve ter pelo menos {minimo} caracteres.")
    if len(v) > maximo:
        raise _erro(f"{campo} deve ter no máximo {maximo} caracteres.")
    return v


def email(valor):
    v = (valor or "").strip().lower() if isinstance(valor, str) else ""
    if not v or len(v) > 254 or not _EMAIL.match(v):
        raise _erro("Informe um e-mail válido.")
    return v


def url_http(valor, campo="Link", maximo=500, obrigatorio=True):
    if valor is None or not str(valor).strip():
        if obrigatorio:
            raise _erro(f"{campo} é obrigatório.")
        return ""
    v = _CTRL.sub("", str(valor)).strip()
    if "://" not in v:
        v = "https://" + v
    if len(v) > maximo:
        raise _erro(f"{campo} muito longo.")
    p = urlparse(v)
    if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
        raise _erro(f"{campo} deve ser uma URL http(s) válida.")
    return v


def escolha(valor, permitidos, campo):
    if valor not in permitidos:
        raise _erro(f"{campo} inválido.")
    return valor


def inteiro(valor, campo, minimo, maximo):
    if isinstance(valor, bool):
        raise _erro(f"{campo} inválido.")
    try:
        n = int(valor)
    except (TypeError, ValueError):
        raise _erro(f"{campo} deve ser um número inteiro.")
    if n < minimo or n > maximo:
        raise _erro(f"{campo} deve estar entre {minimo} e {maximo}.")
    return n


def dinheiro(valor, campo, minimo=0.01, maximo=1_000_000):
    if isinstance(valor, bool):
        raise _erro(f"{campo} inválido.")
    try:
        n = round(float(valor), 2)
    except (TypeError, ValueError):
        raise _erro(f"{campo} inválido.")
    if n != n or n < minimo or n > maximo:
        raise _erro(f"{campo} fora do intervalo permitido.")
    return n


def data_iso(valor, campo, fim_do_dia=False):
    """Aceita 'YYYY-MM-DD' ou ISO completo; devolve datetime UTC (ou None)."""
    if not valor:
        return None
    try:
        s = str(valor).strip().replace("Z", "+00:00")
        if len(s) == 10:
            s += "T23:59:59+00:00" if fim_do_dia else "T00:00:00+00:00"
        d = datetime.fromisoformat(s)
    except ValueError:
        raise _erro(f"{campo} inválida.")
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def cpf_cnpj(valor):
    d = re.sub(r"\D", "", str(valor or ""))
    if len(d) == 11 and _cpf_ok(d):
        return d
    if len(d) == 14 and _cnpj_ok(d):
        return d
    raise _erro("CPF/CNPJ inválido.")


def _cpf_ok(d):
    if d == d[0] * 11:
        return False
    for n in (9, 10):
        soma = sum(int(d[i]) * (n + 1 - i) for i in range(n))
        if int(d[n]) != (soma * 10 % 11) % 10:
            return False
    return True


def _cnpj_ok(d):
    if d == d[0] * 14:
        return False
    def dv(base):
        pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2][-len(base):]
        r = sum(int(a) * b for a, b in zip(base, pesos)) % 11
        return 0 if r < 2 else 11 - r
    return int(d[12]) == dv(d[:12]) and int(d[13]) == dv(d[:13])


def imagem_banner(valor, limite):
    """Valida data URL/base64 de PNG ou JPEG. Retorna (mime, base64_puro)."""
    if not valor:
        return None
    s = str(valor)
    if s.startswith("data:"):
        try:
            cab, s = s.split(",", 1)
        except ValueError:
            raise _erro("Imagem inválida.")
    try:
        bruto = base64.b64decode(s, validate=True)
    except (binascii.Error, ValueError):
        raise _erro("Imagem inválida.")
    if len(bruto) > limite:
        raise _erro(f"A imagem deve ter no máximo {limite // 1024} KB.")
    if bruto.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif bruto.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    else:
        raise _erro("Envie uma imagem PNG ou JPEG.")
    return mime, base64.b64encode(bruto).decode("ascii")
