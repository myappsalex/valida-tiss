"""/api/auth – login, registro, sessão e troca de senha.

Corrige: `registro_admin` público (qualquer um criava ADMIN), erros que revelavam
se o e-mail existia, login de conta bloqueada/cancelada permitido, sem limite de
tentativas, política de senha só no navegador, sessão forjável.
Criação de usuário interno agora é feita em /api/gestao_usuarios (ADMIN).
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import timedelta

from vt_core import config, security, validation as v
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler


def publico(p):
    """Payload de sessão exposto ao navegador (sem segredos)."""
    r = p.rec
    base = {"id": p.id, "nome": p.nome, "email": p.email, "tipo": p.tipo,
            "mustChangePassword": p.must_change}
    if p.tipo == "INTERNO":
        base.update(perfil=p.perfil, permissoes=sorted(p.permissoes))
    else:
        base.update(statusConta=r.statusConta, plano=security.plano_efetivo(r),
                    statusPagamento=getattr(r, "statusPagamento", "ATIVO") or "ATIVO",
                    tokensRestantes=r.tokensIA,
                    exportacoesRestantes=getattr(r, "exportacoesGratis", 0), 
                    cpfCnpj=getattr(r, "cpfCnpj", ""), 
                    permissoes=[])
    return base


def _buscar(db, tipo, email):
    if tipo == "INTERNO":
        return db.usuario.find_unique(where={"email": email})
    return db.cliente.find_unique(where={"emailAcesso": email})


def _tabela(db, tipo):
    return db.usuario if tipo == "INTERNO" else db.cliente


def _login(ctx, corpo, tipo):
    email = security.normalizar_email(corpo.get("email"))
    senha = corpo.get("senha")
    if not email or not isinstance(senha, str) or not senha:
        raise ApiError(400, "Informe e-mail e senha.")
    db = get_db()
    rec = _buscar(db, tipo, email)
    agora = security.agora_utc()
    tabela = _tabela(db, tipo)

    bloqueado_ate = security._aware(getattr(rec, "bloqueadoAte", None)) if rec else None
    if bloqueado_ate and bloqueado_ate > agora:
        security.verificar_senha(senha, None)  # mantém o custo de tempo
        raise ApiError(429, "Muitas tentativas. Aguarde alguns minutos e tente de novo.", "bloqueio_temporario")

    ok = security.verificar_senha(senha, rec.senhaHash if rec else None)
    if not rec or not ok:
        if rec:
            novo = tabela.update(where={"id": rec.id}, data={"tentativasFalhas": {"increment": 1}})
            if novo.tentativasFalhas >= config.LOGIN_MAX_FALHAS:
                tabela.update(where={"id": rec.id}, data={
                    "tentativasFalhas": 0,
                    "bloqueadoAte": agora + timedelta(minutes=config.LOGIN_BLOQUEIO_MINUTOS)})
        raise ApiError(401, "E-mail ou senha inválidos.", "credenciais")

    motivo = security.motivo_negar_acesso(rec, tipo)
    if motivo:
        raise ApiError(403, motivo, "conta_inativa")

    rec = tabela.update(where={"id": rec.id}, data={
        "tentativasFalhas": 0, "bloqueadoAte": None, "ultimoLoginEm": agora})
    ctx.definir_sessao(tipo, rec)
    from vt_core.web import Principal
    return {"sucesso": True, "usuario": publico(Principal(tipo, rec))}


def _registro(ctx, corpo):
    nome = v.texto(corpo.get("nome"), "Nome", 2, 120)
    email = v.email(corpo.get("email"))
    senha = corpo.get("senha")
    cpf_cnpj = v.cpf_cnpj(corpo.get("cpfCnpj")) # NOVO: Valida o CPF/CNPJ
    
    msg = security.validar_politica_senha(senha, email, nome)
    if msg:
        raise ApiError(422, msg, "senha_fraca")
    if corpo.get("aceite_termos") is not True:
        raise ApiError(422, "É necessário ler e aceitar os Termos de Uso.", "termos")
        
    db = get_db()
    if db.cliente.find_unique(where={"emailAcesso": email}):
        raise ApiError(409, "Já existe uma conta com este e-mail.", "duplicado")
        
    db.cliente.create(data={
        "nomeEmpresa": nome, "emailAcesso": email, "senhaHash": security.hash_senha(senha),
        "cpfCnpj": cpf_cnpj, "ipAceite": ctx.ip, # NOVO: Grava CPF e IP
        "tokensIA": 0, "statusConta": "PENDENTE", "plano": "FREEMIUM",
        "statusPagamento": "ATIVO", "aceiteTermosEm": security.agora_utc()})
    return {"sucesso": True, "mensagem": "Conta criada! Ela ficará pendente até a liberação pela nossa equipe."}


def _trocar_senha(ctx, corpo):
    p = ctx.exigir(permitir_troca_pendente=True)
    atual, nova = corpo.get("senha_atual"), corpo.get("nova_senha")
    if not isinstance(atual, str) or not security.verificar_senha(atual, p.rec.senhaHash):
        raise ApiError(401, "Senha atual incorreta.", "credenciais")
    msg = security.validar_politica_senha(nova, p.email, p.nome)
    if msg:
        raise ApiError(422, msg, "senha_fraca")
    if nova == atual:
        raise ApiError(422, "A nova senha deve ser diferente da atual.", "senha_fraca")
    db = get_db()
    rec = _tabela(db, p.tipo).update(where={"id": p.id}, data={
        "senhaHash": security.hash_senha(nova), "mustChangePassword": False,
        "tokenVersion": {"increment": 1}})
    ctx.definir_sessao(p.tipo, rec)  # novo cookie; sessões antigas ficam inválidas
    from vt_core.web import Principal
    return {"sucesso": True, "mensagem": "Senha alterada.", "usuario": publico(Principal(p.tipo, rec))}


class handler(ApiHandler):
    def get(self, ctx):
        p = ctx.exigir(permitir_troca_pendente=True)
        return {"sucesso": True, "usuario": publico(p)}

    def post(self, ctx):
        corpo = ctx.json()
        acao = corpo.get("acao")
        if acao == "login":
            return _login(ctx, corpo, "CLIENTE")
        if acao == "login_admin":
            return _login(ctx, corpo, "INTERNO")
        if acao == "registro":
            return _registro(ctx, corpo) # Passa o contexto para pegar o IP
        if acao == "me":
            return {"sucesso": True, "usuario": publico(ctx.exigir(permitir_troca_pendente=True))}
        if acao == "logout":
            p = ctx.principal()
            if p is not None:  # revoga no servidor: um cookie copiado deixa de valer (encerra também outros dispositivos)
                _tabela(get_db(), p.tipo).update(where={"id": p.id}, data={"tokenVersion": {"increment": 1}})
            ctx.encerrar_sessao()
            return {"sucesso": True}
        if acao == "trocar_senha":
            return _trocar_senha(ctx, corpo)
        raise ApiError(400, "Ação não reconhecida.")
