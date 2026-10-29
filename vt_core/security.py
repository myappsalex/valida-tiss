"""Senhas, sessão e permissões.

Corrige no original:
  * sessão apenas em sessionStorage (qualquer pessoa podia forjar {perfil:'ADMIN'});
  * ausência total de autorização nos endpoints;
  * senha provisória fixa "Mudar@123";
  * política de senha só no navegador;
  * mensagens de login que revelavam se o e-mail existia;
  * ausência de limite de tentativas.
"""
import hmac
import os
import re
import secrets
import time
from datetime import datetime, timezone

import bcrypt
import jwt

from . import config

ISSUER = "validatiss"


class SessaoInvalida(Exception):
    pass


# ----------------------------------------------------------------- permissões
# Matriz de permissões por perfil interno. "*" = tudo.
PERMISSOES = {
    "ADMIN": {"*"},
    "OPERACAO": {
        "clientes:ler", "clientes:editar", "tokens:ajustar", "assinatura:editar",
        "tuss:ler", "tuss:editar", "tuss:carga", "regras:ler",
    },
    "PUBLICIDADE": {"clientes:ler", "ads:ler", "ads:avaliar", "ads:criar"},
    "GESTAO": {"clientes:ler", "regras:ler", "tuss:ler", "ads:ler"},
}
TODAS_PERMISSOES = sorted({
    "usuarios:gerir", "clientes:ler", "clientes:editar", "tokens:ajustar",
    "assinatura:editar", "tuss:ler", "tuss:editar", "tuss:carga", "regras:ler",
    "ads:ler", "ads:avaliar", "ads:criar", "auditoria:ler", "config:editar",
})


def permissoes_do_perfil(perfil):
    conjunto = PERMISSOES.get(perfil, set())
    return frozenset(TODAS_PERMISSOES) if "*" in conjunto else frozenset(conjunto)


# --------------------------------------------------------------------- e-mail
def normalizar_email(valor):
    return (valor or "").strip().lower() if isinstance(valor, str) else ""


# ---------------------------------------------------------------------- senha
_SENHAS_COMUNS = {
    "123456789a", "1234567890", "qwertyuiop", "password123", "senha12345",
    "mudar@123", "mudar@1234", "admin12345", "abc1234567", "brasil12345",
}


def _rounds():
    try:
        return max(4, min(15, int(os.environ.get("VT_BCRYPT_ROUNDS", "12"))))
    except ValueError:
        return 12


def hash_senha(senha):
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt(_rounds())).decode("utf-8")


_HASH_FICTICIO = None


def verificar_senha(senha, hash_armazenado):
    """Compara em tempo ~constante, inclusive quando o usuário não existe."""
    global _HASH_FICTICIO
    bruto = (senha or "").encode("utf-8")[:72]
    if not hash_armazenado:
        if _HASH_FICTICIO is None:
            _HASH_FICTICIO = hash_senha("senha-ficticia-nunca-usada-1!")
        bcrypt.checkpw(bruto, _HASH_FICTICIO.encode("utf-8"))
        return False
    try:
        return bcrypt.checkpw(bruto, hash_armazenado.encode("utf-8"))
    except ValueError:
        return False


def validar_politica_senha(senha, email="", nome=""):
    """Retorna None se ok, ou a mensagem de erro (em pt-BR)."""
    if not isinstance(senha, str):
        return "Senha inválida."
    if len(senha) < 10:
        return "A senha deve ter pelo menos 10 caracteres."
    if len(senha.encode("utf-8")) > 72:
        return "A senha pode ter no máximo 72 bytes (cerca de 72 caracteres)."
    if senha.lower() in _SENHAS_COMUNS or re.fullmatch(r"(.)\1+", senha):
        return "Essa senha é muito comum. Escolha outra."
    local = (email or "").split("@")[0].lower()
    if len(local) >= 4 and local in senha.lower():
        return "A senha não pode conter o seu e-mail."
    classes = sum(bool(re.search(p, senha)) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^\w\s]"))
    if classes < 3:
        return "Use pelo menos 3 tipos entre: minúsculas, maiúsculas, números e símbolos."
    return None


def gerar_senha_temporaria():
    alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    while True:
        s = "".join(secrets.choice(alfabeto) for _ in range(12))
        s += secrets.choice("!@#$%&*") + str(10 + secrets.randbelow(90))
        if validar_politica_senha(s) is None:
            return s


# --------------------------------------------------------------------- sessão
def emitir_sessao(tipo, sub, token_version=0):
    agora = int(time.time())
    return jwt.encode(
        {"iss": ISSUER, "sub": sub, "typ": tipo, "tv": int(token_version or 0),
         "iat": agora, "exp": agora + config.SESSAO_TTL_SEGUNDOS},
        config.session_secret(), algorithm="HS256")


def verificar_sessao(token):
    try:
        return jwt.decode(
            token, config.session_secret(), algorithms=["HS256"], issuer=ISSUER,
            options={"require": ["exp", "iat", "sub", "typ"]})
    except jwt.PyJWTError as exc:
        raise SessaoInvalida(str(exc)) from exc


def comparar_seguro(a, b):
    return hmac.compare_digest((a or "").encode("utf-8"), (b or "").encode("utf-8"))


# ------------------------------------------------------------ estado da conta
def agora_utc():
    return datetime.now(timezone.utc)


def _aware(dt):
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def status_interno(rec):
    """Status efetivo do usuário interno (compatível com o legado em que o
    bloqueio sobrescrevia o campo `perfil`)."""
    if getattr(rec, "perfil", "") in ("BLOQUEADO", "CANCELADO"):
        return rec.perfil
    return getattr(rec, "status", None) or "ATIVO"


def motivo_negar_acesso(rec, tipo):
    """None = pode entrar. Caso contrário, mensagem para o usuário."""
    if tipo == "INTERNO":
        st = status_interno(rec)
        if st == "BLOQUEADO":
            return "Acesso bloqueado. Procure um administrador."
        if st == "CANCELADO":
            return "Cadastro cancelado. Procure um administrador."
        return None
    st = getattr(rec, "statusConta", "PENDENTE")
    if st == "BLOQUEADO":
        return "Conta bloqueada. Entre em contato com o suporte."
    if st == "CANCELADO":
        efetiva = _aware(getattr(rec, "dataCancelamento", None))
        if efetiva is None or efetiva <= agora_utc():
            return "Conta cancelada. Entre em contato com o suporte."
    return None


def plano_efetivo(rec):
    """PREMIUM expira quando `planoValidoAte` passa (sem precisar de cron)."""
    plano = getattr(rec, "plano", None) or "FREEMIUM"
    validade = _aware(getattr(rec, "planoValidoAte", None))
    if plano == "PREMIUM" and validade is not None and validade < agora_utc():
        return "FREEMIUM"
    return plano
