"""/api/publicidade – pedidos de anúncio (cliente) e gestão (staff).

Corrige: tudo sem autenticação; cliente podia se auto-ativar via
`resposta_cliente` com status arbitrário (anúncio grátis); `usuarioId` vinha do
navegador (IDOR); `localExibicao` e a arte do banner eram descartados na
criação; sem validação de URL/tamanho; sem máquina de estados.

Anunciante AVULSO (sem conta): visitantes e a equipe podem registrar um pedido sem login; ele fica
numa conta de sistema (statusConta=GUEST, sem senha utilizável) e a equipe conclui por e-mail/telefone.
Há limites contra spam (por e-mail e global). Anúncios ativos: GET ?acao=ativas (público, com cache).

Fluxo: PENDENTE -> (staff) ORCADO -> (cliente aprova em /api/gerar_pix)
AGUARDANDO_PAGAMENTO -> (webhook Asaas) ATIVO. CANCELADO/REJEITADO/EXPIRADO finais.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import asaas, audit, config, validation as v
from vt_core.db import get_db
from vt_core.security import agora_utc
from vt_core.web import ApiError, ApiHandler

EMAIL_AVULSO = "anunciante.avulso@validatiss.com"
MAX_AVULSOS_PENDENTES = 100        # global: limita crescimento do banco por pedidos anônimos
MAX_AVULSOS_POR_EMAIL = 3


def conta_avulsa(db):
    """Conta de sistema que agrupa pedidos de anunciantes sem cadastro. Não autentica (senhaHash inválido)."""
    c = db.cliente.find_first(where={"emailAcesso": EMAIL_AVULSO})
    if c:
        return c
    try:
        return db.cliente.create(data={"nomeEmpresa": "[Controle Interno] Anunciantes Avulsos", "emailAcesso": EMAIL_AVULSO,
                                       "senhaHash": "!", "statusConta": "GUEST", "tokensIA": 0})
    except Exception as exc:
        if type(exc).__name__ == "UniqueViolationError":      # corrida: outra requisição criou antes
            return db.cliente.find_first(where={"emailAcesso": EMAIL_AVULSO})
        raise

DESTINOS_STAFF = ("PENDENTE", "ORCADO", "ATIVO", "CANCELADO", "REJEITADO")


def _item(r, staff=False):
    d = {"id": r.id, "empresa_nome": r.empresa_nome, "tema": r.tema, "status": r.status,
         "valorOrcamento": r.valorOrcamento or 0.0, "observacaoAdmin": r.observacaoAdmin or "",
         "dataInicio": r.dataInicio.isoformat() if r.dataInicio else "",
         "dataFim": r.dataFim.isoformat() if r.dataFim else "",
         "localExibicao": r.localExibicao or "CABECALHO", "link_destino": r.link_destino,
         "criadoEm": getattr(r, "criadoEm", None)}
    if staff:
        d["email_contato"] = r.email_contato
        d["usuarioId"] = r.usuarioId
    return d


class handler(ApiHandler):
    def get(self, ctx):
        acao = ctx.query.get("acao", "")
        db = get_db()
        if acao == "listar":
            ctx.exigir(tipo="INTERNO", permissao="ads:ler")
            where = {}
            if ctx.query.get("cliente"):
                where["empresa_nome"] = {"contains": ctx.query["cliente"][:100], "mode": "insensitive"}
            if ctx.query.get("status"):
                where["status"] = v.escolha(ctx.query["status"], config.STATUS_ADS, "Status")
            rows = db.campanhaads.find_many(where=where, order={"criadoEm": "desc"}, take=200)
            return [_item(r, staff=True) for r in rows]
        if acao == "listar_minhas":
            p = ctx.exigir(tipo="CLIENTE")  # ignora qualquer clienteId da URL
            rows = db.campanhaads.find_many(where={"usuarioId": p.id}, order={"criadoEm": "desc"}, take=100)
            return [_item(r) for r in rows]
        if acao == "ativas":     # público (substitui o antigo /api/campanhas: menos uma função serverless)
            agora = agora_utc()
            rows = db.campanhaads.find_many(
                where={"status": "ATIVO",
                       "OR": [{"dataInicio": None}, {"dataInicio": {"lte": agora}}],
                       "AND": [{"OR": [{"dataFim": None}, {"dataFim": {"gte": agora}}]}]},
                take=50)
            lista = [{"id": c.id, "titulo": c.empresa_nome, "texto": c.tema, "link": c.link_destino or "",
                      "banner": c.bannerUrl or "", "local": c.localExibicao or "CABECALHO"} for c in rows]
            return (200, lista, {"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"})
        raise ApiError(400, "Ação GET inválida.")

    def post(self, ctx):
        acao = ctx.json(limite=600 * 1024).get("acao")
        d = ctx.json(limite=600 * 1024)
        db = get_db()

        if acao == "criar":
            p = ctx.principal()
            avulso = False
            if p is not None and p.tipo == "CLIENTE":
                ctx.exigir(tipo="CLIENTE")                      # (troca de senha pendente etc.)
                cliente, empresa, email_ctt = p.rec, p.rec.nomeEmpresa, p.rec.emailAcesso   # ignora usuarioId do corpo
            elif p is not None:                                 # equipe
                p = ctx.exigir()
                if not p.pode("ads:criar"):
                    raise ApiError(403, "Seu perfil não tem permissão para esta ação.", "proibido")
                alvo = str(d.get("usuarioId") or "").strip()
                if alvo and alvo != "GUEST":
                    cliente = db.cliente.find_unique(where={"id": alvo})
                    if not cliente or cliente.statusConta == "GUEST":
                        raise ApiError(404, "Cliente não encontrado.")
                    empresa, email_ctt = cliente.nomeEmpresa, cliente.emailAcesso
                else:
                    avulso = True
            else:                                               # visitante sem login
                avulso = True
            if avulso:
                empresa = v.texto(d.get("empresa_nome"), "Nome da empresa", 2, 120)
                email_ctt = v.email(d.get("email_contato"))
                cliente = conta_avulsa(db)
                if db.campanhaads.count(where={"usuarioId": cliente.id, "status": "PENDENTE"}) >= MAX_AVULSOS_PENDENTES:
                    raise ApiError(429, "Recebemos muitos pedidos no momento. Tente novamente mais tarde.", "limite")
                if db.campanhaads.count(where={"usuarioId": cliente.id, "status": "PENDENTE", "email_contato": email_ctt}) >= MAX_AVULSOS_POR_EMAIL:
                    raise ApiError(429, "Já recebemos seus pedidos. A equipe comercial entrará em contato.", "limite")
            img = v.imagem_banner(d.get("arquivo_base64"), config.LIMITE_BANNER_BYTES)
            logo = v.url_http(d.get("logoUrl"), "URL da logo", obrigatorio=False)
            if logo and not logo.lower().startswith("https://"):
                raise ApiError(422, "A URL da logo deve começar com https://", "validacao")
            data = {
                "usuarioId": cliente.id, "empresa_nome": empresa, "email_contato": email_ctt,
                "link_destino": v.url_http(d.get("link_destino"), "Link de destino"),
                "tema": v.texto(d.get("tema"), "Tema", 10, 280),
                "localExibicao": v.escolha(d.get("localExibicao", "CABECALHO"), config.LOCAIS_ADS, "Local"),
                "status": "PENDENTE", "valorOrcamento": 0.0, "bannerUrl": logo or None}
            if img:
                data["bannerMime"], data["bannerDados"] = img
            if not avulso and db.campanhaads.count(where={"usuarioId": cliente.id, "status": "PENDENTE"}) >= 5:
                raise ApiError(429, "Você já tem 5 pedidos pendentes. Aguarde a análise.", "limite")
            nova = db.campanhaads.create(data=data)
            if img:
                db.campanhaads.update(where={"id": nova.id}, data={"bannerUrl": f"/api/banner?id={nova.id}"})
            return {"sucesso": True, "id": nova.id, "avulso": avulso}

        if acao == "avaliar":
            p = ctx.exigir(tipo="INTERNO", permissao="ads:avaliar")
            camp = db.campanhaads.find_unique(where={"id": str(d.get("id") or "")})
            if not camp:
                raise ApiError(404, "Pedido não encontrado.")
            status = v.escolha(d.get("status"), DESTINOS_STAFF, "Status")
            valor = v.dinheiro(d.get("valorOrcamento") or 0, "Valor", minimo=0)
            ini = v.data_iso(d.get("dataInicio"), "Data de início")
            fim = v.data_iso(d.get("dataFim"), "Data fim", fim_do_dia=True)
            if ini and fim and fim < ini:
                raise ApiError(422, "A data fim deve ser posterior ao início.", "validacao")
            if status == "ORCADO" and valor <= 0:
                raise ApiError(422, "Informe um valor maior que zero para enviar o orçamento.", "validacao")
            if status == "ATIVO" and not fim:
                raise ApiError(422, "Informe a data fim para ativar o anúncio.", "validacao")
            if camp.status in ("CANCELADO", "REJEITADO") and status != camp.status:
                raise ApiError(409, "Pedido encerrado não pode ser reaberto.", "estado")
            data = {"status": status, "observacaoAdmin": v.texto(d.get("observacaoAdmin"), "Observação", 0, 1000, False),
                    "valorOrcamento": valor, "dataInicio": ini, "dataFim": fim,
                    "localExibicao": v.escolha(d.get("localExibicao", camp.localExibicao or "CABECALHO"), config.LOCAIS_ADS, "Local")}
            if status == "ORCADO" and camp.asaasPaymentId:
                asaas.cancelar_cobranca(camp.asaasPaymentId)  # novo valor invalida a cobrança anterior
                data["asaasPaymentId"] = None
            db.campanhaads.update(where={"id": camp.id}, data=data)
            audit.registrar(db, p, "ADS_AVALIADO", "CAMPANHA", camp.id,
                            {"de": camp.status, "para": status, "valor": valor}, ctx.ip)
            return {"sucesso": True}

        if acao == "resposta_cliente":
            p = ctx.exigir(tipo="CLIENTE")
            camp = db.campanhaads.find_first(where={"id": str(d.get("id") or ""), "usuarioId": p.id})
            if not camp:
                raise ApiError(404, "Pedido não encontrado.")
            if camp.status not in config.STATUS_ADS_ABERTOS:
                raise ApiError(409, "Este pedido não pode mais ser cancelado.", "estado")
            n = db.campanhaads.update_many(
                where={"id": camp.id, "status": {"in": list(config.STATUS_ADS_ABERTOS)}},
                data={"status": "CANCELADO"})
            if n and camp.asaasPaymentId:
                asaas.cancelar_cobranca(camp.asaasPaymentId)
            return {"sucesso": True}

        raise ApiError(400, "Ação POST inválida.")
