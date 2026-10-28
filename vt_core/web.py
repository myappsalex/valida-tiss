"""Camada HTTP comum: JSON, cookies, CSRF, erros padronizados e RBAC.

Substitui as 12 cópias de `_send_response` e o `str(e)` devolvido ao cliente
(vazava detalhes internos). Erros inesperados viram 500 genérico + id de
correlação; o detalhe vai só para o log.
"""
import json
import sys
import secrets
import traceback
from datetime import date, datetime
from decimal import Decimal
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from . import config, security, db as dbmod

_AUSENTE = object()


class ApiError(Exception):
    def __init__(self, status, mensagem, codigo=None, extra=None):
        super().__init__(mensagem)
        self.status, self.mensagem, self.codigo, self.extra = status, mensagem, codigo, extra or {}


class Resposta:
    def __init__(self, status=200, corpo=b"", content_type="application/json; charset=utf-8", headers=None):
        self.status, self.corpo, self.content_type, self.headers = status, corpo, content_type, headers or {}


def _json_default(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    raise TypeError(f"não serializável: {type(o).__name__}")


class Principal:
    def __init__(self, tipo, rec):
        self.tipo, self.rec, self.id = tipo, rec, rec.id
        if tipo == "INTERNO":
            self.nome, self.email, self.perfil = rec.nome, rec.email, rec.perfil
            self.permissoes = security.permissoes_do_perfil(rec.perfil)
        else:
            self.nome, self.email, self.perfil = rec.nomeEmpresa, rec.emailAcesso, None
            self.permissoes = frozenset()
        self.must_change = bool(getattr(rec, "mustChangePassword", False))

    def pode(self, permissao):
        return permissao in self.permissoes


class Ctx:
    def __init__(self, h, metodo, rid):
        self.h, self.metodo, self.rid = h, metodo, rid
        p = urlparse(h.path)
        self.path = p.path
        self.query = {k: v[0] for k, v in parse_qs(p.query, keep_blank_values=True).items()}
        self._set_cookies = []
        self._principal = _AUSENTE
        self._corpo = _AUSENTE

    # -- entrada ------------------------------------------------------------
    def header(self, nome):
        return self.h.headers.get(nome)

    @property
    def ip(self):
        xff = self.header("x-forwarded-for") or self.header("x-real-ip") or ""
        return xff.split(",")[0].strip() or (self.h.client_address[0] if self.h.client_address else "")

    def corpo_bruto(self, limite=None):
        limite = limite or config.LIMITE_JSON_PADRAO
        try:
            n = int(self.header("content-length") or 0)
        except ValueError:
            raise ApiError(400, "Content-Length inválido.")
        if n > limite:
            raise ApiError(413, "Payload grande demais.", "payload")
        return self.h.rfile.read(n) if n > 0 else b""

    def json(self, limite=None):
        if self._corpo is _AUSENTE:
            ct = (self.header("content-type") or "").split(";")[0].strip().lower()
            bruto = self.corpo_bruto(limite)
            if bruto and ct != "application/json":
                raise ApiError(415, "Content-Type deve ser application/json.")
            try:
                dado = json.loads(bruto.decode("utf-8")) if bruto else {}
            except (ValueError, UnicodeDecodeError):
                raise ApiError(400, "JSON inválido.")
            if not isinstance(dado, dict):
                raise ApiError(400, "O corpo deve ser um objeto JSON.")
            self._corpo = dado
        return self._corpo

    def checar_origem(self):
        """Defesa CSRF adicional ao SameSite=Strict."""
        sfs = self.header("sec-fetch-site")
        if sfs and sfs not in ("same-origin", "none"):
            raise ApiError(403, "Origem não permitida.", "csrf")
        origem = self.header("origin")
        if origem:
            host = self.header("x-forwarded-host") or self.header("host") or ""
            if urlparse(origem).netloc != host:
                raise ApiError(403, "Origem não permitida.", "csrf")

    # -- cookies ------------------------------------------------------------
    @property
    def nome_cookie(self):
        return config.COOKIE_SESSAO_DEV if config.dev_inseguro() else config.COOKIE_SESSAO_SEGURO

    def _cookie(self, valor, max_age):
        c = f"{self.nome_cookie}={valor}; Path=/; Max-Age={max_age}; HttpOnly; SameSite=Strict"
        return c if config.dev_inseguro() else c + "; Secure"

    def definir_sessao(self, tipo, rec):
        tok = security.emitir_sessao(tipo, rec.id, getattr(rec, "tokenVersion", 0))
        self._set_cookies.append(self._cookie(tok, config.SESSAO_TTL_SEGUNDOS))

    def encerrar_sessao(self):
        self._set_cookies.append(self._cookie("", 0))

    def _token_cookie(self):
        for parte in (self.header("cookie") or "").split(";"):
            k, _, v = parte.strip().partition("=")
            if k == self.nome_cookie:
                return v
        return None

    # -- autenticação / autorização ----------------------------------------
    def principal(self):
        if self._principal is _AUSENTE:
            self._principal = self._carregar_principal()
        return self._principal

    def _carregar_principal(self):
        tok = self._token_cookie()
        if not tok:
            return None
        try:
            c = security.verificar_sessao(tok)
        except security.SessaoInvalida:
            return None
        db = dbmod.get_db()
        tipo = c.get("typ")
        if tipo == "INTERNO":
            rec = db.usuario.find_unique(where={"id": c["sub"]})
        elif tipo == "CLIENTE":
            rec = db.cliente.find_unique(where={"id": c["sub"]})
        else:
            return None
        if rec is None or int(getattr(rec, "tokenVersion", 0) or 0) != int(c.get("tv", 0)):
            return None
        if security.motivo_negar_acesso(rec, tipo):
            return None  # bloqueio vale na hora, sem esperar o JWT expirar
        return Principal(tipo, rec)

    def exigir(self, tipo=None, permissao=None, permitir_troca_pendente=False):
        p = self.principal()
        if p is None:
            raise ApiError(401, "Sessão expirada. Faça login novamente.", "nao_autenticado")
        if tipo and p.tipo != tipo:
            raise ApiError(403, "Acesso negado.", "proibido")
        if p.must_change and not permitir_troca_pendente:
            raise ApiError(403, "Troque a senha provisória para continuar.", "troca_senha")
        if permissao and not p.pode(permissao):
            raise ApiError(403, "Seu perfil não tem permissão para esta ação.", "proibido")
        return p


class ApiHandler(BaseHTTPRequestHandler):
    """Subclasse e implemente get(ctx) e/ou post(ctx). Retorne dict/list,
    (status, payload), (status, payload, headers) ou Resposta."""
    protocol_version = "HTTP/1.1"
    exige_origem_em_post = True

    def log_message(self, *a):  # silencia o log padrão (traz IP/URL)
        pass

    def do_GET(self):
        self._executar("GET")

    def do_POST(self):
        self._executar("POST")

    def do_PUT(self):
        self._executar("PUT")

    do_DELETE = do_PATCH = do_PUT

    def _executar(self, metodo):
        rid = secrets.token_hex(6)
        ctx = None
        try:
            ctx = Ctx(self, metodo, rid)
            fn = getattr(self, metodo.lower(), None) if metodo in ("GET", "POST") else None
            if fn is None:
                raise ApiError(405, "Método não permitido.")
            if metodo == "POST" and self.exige_origem_em_post:
                ctx.checar_origem()
            self._enviar(ctx, fn(ctx))
        except ApiError as e:
            self._enviar(ctx, (e.status, {"sucesso": False, "erro": e.mensagem,
                                          "codigo": e.codigo, **e.extra}))
        except config.ConfigError as e:
            print(f"[{rid}] CONFIG: {e}", file=sys.stderr)
            self._enviar(ctx, (500, {"sucesso": False, "erro": "Configuração do servidor incompleta.", "id": rid}))
        except Exception as e:
            nome = type(e).__name__
            if nome == "RecordNotFoundError":
                self._enviar(ctx, (404, {"sucesso": False, "erro": "Registro não encontrado."}))
            elif nome == "UniqueViolationError":
                self._enviar(ctx, (409, {"sucesso": False, "erro": "Registro duplicado."}))
            else:
                print(f"[{rid}] ERRO: {traceback.format_exc()}", file=sys.stderr)
                self._enviar(ctx, (500, {"sucesso": False, "erro": "Erro interno. Informe o código ao suporte.", "id": rid}))

    def _enviar(self, ctx, resultado):
        if isinstance(resultado, Resposta):
            r = resultado
        else:
            headers = {}
            if isinstance(resultado, tuple):
                status, payload = resultado[0], resultado[1]
                headers = resultado[2] if len(resultado) > 2 else {}
            else:
                status, payload = 200, resultado
            r = Resposta(status, json.dumps(payload, ensure_ascii=False, default=_json_default).encode("utf-8"), headers=headers)
        self.send_response(r.status)
        self.send_header("Content-Type", r.content_type)
        self.send_header("Content-Length", str(len(r.corpo)))
        self.send_header("Cache-Control", r.headers.get("Cache-Control", "no-store"))
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in r.headers.items():
            if k != "Cache-Control":
                self.send_header(k, str(v))
        if ctx is not None:
            for c in ctx._set_cookies:
                self.send_header("Set-Cookie", c)
            self.send_header("X-Request-Id", ctx.rid)
        self.end_headers()
        self.wfile.write(r.corpo)
