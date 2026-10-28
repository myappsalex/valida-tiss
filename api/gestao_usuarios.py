"""

Corrige: endpoint sem autenticação; reset para senha fixa; `atualizar_tokens`
chamado pelo front mas inexistente; filtros ignorados; listagem de clientes sem
plano/tokens/statusPagamento (a grade mostrava sempre FREEMIUM/0); bloqueio que
sobrescrevia `perfil`; `editar` com valor arbitrário; reativação acidental ao
editar nome; data de cancelamento ignorada; sem paginação nem auditoria.
"""
"""/api/gestao_usuarios – IAM interno e carteira de clientes (somente staff)."""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import audit, config, security, validation as v
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler

def _item_cliente(c):
    return {"id": c.id, "nome": c.nomeEmpresa, "email": c.emailAcesso,
            "statusConta": c.statusConta, "plano": security.plano_efetivo(c),
            "statusPagamento": getattr(c, "statusPagamento", "ATIVO") or "ATIVO",
            "tokensRestantes": c.tokensIA, "criadoEm": getattr(c, "criadoEm", None),
            "dataCancelamento": getattr(c, "dataCancelamento", None)}

def _item_interno(u):
    return {"id": u.id, "nome": u.nome, "email": u.email, "perfil": u.perfil,
            "status": security.status_interno(u), "criadoEm": getattr(u, "criadoEm", None)}

def _tabela(db, tipo):
    return db.usuario if tipo == "INTERNO" else db.cliente

def _alvo(db, tipo, id_):
    rec = _tabela(db, tipo).find_unique(where={"id": str(id_ or "")})
    if not rec:
        raise ApiError(404, "Registro não encontrado.")
    # -----------------------------------------------------------------
    # INTEGRAÇÃO: Oculta e protege a conta de anúncios avulsos do Admin
    # -----------------------------------------------------------------
    if tipo == "CLIENTE" and rec.emailAcesso == "anunciante.avulso@validatiss.com":
        raise ApiError(403, "Esta é uma conta de sistema (GUEST) e não pode ser alterada manualmente.")
    return rec

def _admins_ativos(db):
    return db.usuario.count(where={"perfil": "ADMIN", "status": "ATIVO"})

class handler(ApiHandler):
    def get(self, ctx):
        tipo = v.escolha(ctx.query.get("tipo", "INTERNO"), ("INTERNO", "CLIENTE"), "Tipo")
        p = ctx.exigir(tipo="INTERNO", permissao="usuarios:gerir" if tipo == "INTERNO" else "clientes:ler")
        db = get_db()
        pagina = max(1, int(ctx.query.get("page", 1) or 1)) if str(ctx.query.get("page", "1")).isdigit() else 1
        tam = min(200, max(1, int(ctx.query.get("pageSize", 50)))) if str(ctx.query.get("pageSize", "50")).isdigit() else 50
        
        if tipo == "INTERNO":
            total = db.usuario.count()
            itens = [_item_interno(u) for u in db.usuario.find_many(
                order={"criadoEm": "desc"}, take=tam, skip=(pagina - 1) * tam)]
        else:
            where = {}
            if ctx.query.get("nome"):
                where["nomeEmpresa"] = {"contains": ctx.query["nome"][:100], "mode": "insensitive"}
            if ctx.query.get("email"):
                where["emailAcesso"] = {"contains": ctx.query["email"][:100].lower()}
            if ctx.query.get("status"):
                where["statusPagamento"] = v.escolha(ctx.query["status"], config.STATUS_PAGAMENTO, "Status")
            if ctx.query.get("statusConta"):
                where["statusConta"] = v.escolha(ctx.query["statusConta"], config.STATUS_CLIENTE, "Status da conta")
            
            # INTEGRAÇÃO: Ignora a conta fictícia nas pesquisas
            where["emailAcesso"] = {"not": "anunciante.avulso@validatiss.com", **where.get("emailAcesso", {})}
            
            total = db.cliente.count(where=where)
            itens = [_item_cliente(c) for c in db.cliente.find_many(
                where=where, order={"criadoEm": "desc"}, take=tam, skip=(pagina - 1) * tam)]
        return (200, itens, {"X-Total-Count": total})

    def post(self, ctx):
        corpo = ctx.json()
        acao = corpo.get("acao")
        p = ctx.exigir(tipo="INTERNO")
        db = get_db()

        if acao == "criar_interno":
            if not p.pode("usuarios:gerir"):
                raise ApiError(403, "Seu perfil não tem permissão para esta ação.", "proibido")
            nome = v.texto(corpo.get("nome"), "Nome", 2, 120)
            email = v.email(corpo.get("email"))
            perfil = v.escolha(corpo.get("perfil"), config.PERFIS_INTERNOS, "Perfil")
            if db.usuario.find_unique(where={"email": email}):
                raise ApiError(409, "E-mail já em uso.", "duplicado")
            temp = security.gerar_senha_temporaria()
            novo = db.usuario.create(data={
                "nome": nome, "email": email, "perfil": perfil, "status": "ATIVO",
                "senhaHash": security.hash_senha(temp), "mustChangePassword": True})
            audit.registrar(db, p, "USUARIO_CRIADO", "INTERNO", novo.id, {"perfil": perfil, "email": email}, ctx.ip)
            return {"sucesso": True, "mensagem": "Usuário criado.", "senhaTemporaria": temp, "id": novo.id}

        tipo = v.escolha(corpo.get("tipo", "CLIENTE" if acao in ("atualizar_tokens", "editar_dados", "editar_assinatura") else None),
                         ("INTERNO", "CLIENTE"), "Tipo")
        perm = "usuarios:gerir" if tipo == "INTERNO" else (
            "tokens:ajustar" if acao == "atualizar_tokens" else ("assinatura:editar" if acao == "editar_assinatura" else "clientes:editar"))
            
        if not p.pode(perm):
            raise ApiError(403, "Seu perfil não tem permissão para esta ação.", "proibido")
            
        alvo = _alvo(db, tipo, corpo.get("id"))
        tabela = _tabela(db, tipo)
        eh_si = tipo == "INTERNO" and alvo.id == p.id

        def proteger_admin(descricao):
            if tipo != "INTERNO": return
            if eh_si: raise ApiError(409, f"Você não pode {descricao} a própria conta.")
            if alvo.perfil == "ADMIN" and security.status_interno(alvo) == "ATIVO" and _admins_ativos(db) <= 1:
                raise ApiError(409, "É preciso manter ao menos um administrador ativo.")

        if acao == "bloquear" or acao == "cancelar":
            proteger_admin("bloquear/cancelar")
            novo_status = "BLOQUEADO" if acao == "bloquear" else "CANCELADO"
            data = {"tokenVersion": {"increment": 1}}
            data["status" if tipo == "INTERNO" else "statusConta"] = novo_status
            if acao == "cancelar" and tipo == "CLIENTE":
                data["dataCancelamento"] = v.data_iso(corpo.get("dataCancelamento"), "Data de cancelamento") or security.agora_utc()
            tabela.update(where={"id": alvo.id}, data=data)
            audit.registrar(db, p, acao.upper(), tipo, alvo.id, {}, ctx.ip)
            return {"sucesso": True, "mensagem": "Acesso revogado com sucesso." if acao == "bloquear" else "Cadastro cancelado."}

        if acao == "reativar":
            data = {"tokenVersion": {"increment": 1}}
            data["status" if tipo == "INTERNO" else "statusConta"] = "ATIVO"
            if tipo == "CLIENTE":
                data["dataCancelamento"] = None
            if tipo == "INTERNO" and alvo.perfil in ("BLOQUEADO", "CANCELADO"):
                raise ApiError(409, "Perfil legado inválido: defina o perfil antes de reativar.")
            tabela.update(where={"id": alvo.id}, data=data)
            audit.registrar(db, p, "REATIVAR", tipo, alvo.id, {}, ctx.ip)
            return {"sucesso": True, "mensagem": "Acesso reativado."}

        if acao == "resetar":
            temp = security.gerar_senha_temporaria()
            tabela.update(where={"id": alvo.id}, data={
                "senhaHash": security.hash_senha(temp), "mustChangePassword": True,
                "tentativasFalhas": 0, "bloqueadoAte": None, "tokenVersion": {"increment": 1}})
            audit.registrar(db, p, "SENHA_RESETADA", tipo, alvo.id, {}, ctx.ip)
            return {"sucesso": True, "mensagem": "Senha provisória gerada. Ela será exigida a troca no próximo acesso.",
                    "senhaTemporaria": temp}

        if acao == "editar":
            novo = str(corpo.get("novo_dado") or "").strip().upper()
            if tipo == "INTERNO":
                novo = v.escolha(novo, config.PERFIS_INTERNOS, "Perfil")
                if novo != "ADMIN": proteger_admin("rebaixar")
                tabela.update(where={"id": alvo.id}, data={"perfil": novo, "tokenVersion": {"increment": 1}})
            else:
                novo = v.escolha(novo, config.STATUS_CLIENTE, "Status")
                tabela.update(where={"id": alvo.id}, data={"statusConta": novo, "tokenVersion": {"increment": 1}})
            audit.registrar(db, p, "EDITAR_ACESSO", tipo, alvo.id, {"novo": novo, "antes": getattr(alvo, "perfil", None) if tipo == "INTERNO" else alvo.statusConta}, ctx.ip)
            return {"sucesso": True, "mensagem": f"Registro atualizado para: {novo}"}

        if acao == "editar_dados":
            if tipo != "CLIENTE": raise ApiError(400, "Disponível apenas para clientes.")
            data = {"nomeEmpresa": v.texto(corpo.get("nome"), "Nome", 2, 120)}
            cancelar = corpo.get("cancelar") is True
            if cancelar:
                data["statusConta"] = "CANCELADO"
                data["dataCancelamento"] = v.data_iso(corpo.get("dataCancelamento"), "Data de cancelamento")
                if data["dataCancelamento"] is None:
                    raise ApiError(422, "Informe a data efetiva do cancelamento.", "validacao")
                data["tokenVersion"] = {"increment": 1}
            elif alvo.statusConta == "CANCELADO":
                data["statusConta"] = "ATIVO"
                data["dataCancelamento"] = None
            tabela.update(where={"id": alvo.id}, data=data)
            audit.registrar(db, p, "EDITAR_DADOS", "CLIENTE", alvo.id, {"cancelar": cancelar}, ctx.ip)
            return {"sucesso": True, "mensagem": "Dados cadastrais atualizados com sucesso."}

        if acao == "atualizar_tokens":
            if tipo != "CLIENTE": raise ApiError(400, "Disponível apenas para clientes.")
            q = v.inteiro(corpo.get("quantidade"), "Quantidade", -100000, 100000)
            if q == 0: raise ApiError(422, "Informe uma quantidade diferente de zero.", "validacao")
            motivo = v.texto(corpo.get("motivo"), "Motivo", 0, 200, obrigatorio=False)
            if q > 0:
                tabela.update(where={"id": alvo.id}, data={"tokensIA": {"increment": q}})
            else:
                n = tabela.update_many(where={"id": alvo.id, "tokensIA": {"gte": -q}},
                                       data={"tokensIA": {"decrement": -q}})
                if n == 0: raise ApiError(409, "Saldo insuficiente para este débito.", "saldo")
            saldo = tabela.find_unique(where={"id": alvo.id}).tokensIA
            audit.registrar(db, p, "TOKENS_AJUSTADOS", "CLIENTE", alvo.id, {"delta": q, "motivo": motivo, "saldo": saldo}, ctx.ip)
            return {"sucesso": True, "mensagem": "Saldo atualizado.", "tokensRestantes": saldo}
            
        if acao == "editar_assinatura":
            if tipo != "CLIENTE": raise ApiError(400, "Disponível apenas para clientes.")
            plano = v.escolha(corpo.get("plano"), config.PLANOS, "Plano")
            status_pag = v.escolha(corpo.get("statusPagamento"), config.STATUS_PAGAMENTO, "Status do pagamento")
            data_upd = {"plano": plano, "statusPagamento": status_pag}
            
            if plano == "PREMIUM" and corpo.get("planoValidoAte"):
                data_upd["planoValidoAte"] = v.data_iso(corpo["planoValidoAte"], "Validade do plano", fim_do_dia=True)
            
            tabela.update(where={"id": alvo.id}, data=data_upd)
            audit.registrar(db, p, "ASSINATURA_ALTERADA", "CLIENTE", alvo.id,
                            {"depois": [plano, status_pag]}, ctx.ip)
            return {"sucesso": True, "mensagem": "Assinatura atualizada."}    

        raise ApiError(400, f"Comando desconhecido.")