"""/api/publicidade – pedidos de anúncio (cliente) e gestão (staff).

Corrige: tudo sem autenticação; cliente podia se auto-ativar via
`resposta_cliente` com status arbitrário (anúncio grátis); `usuarioId` vinha do
navegador (IDOR); `localExibicao` e a arte do banner eram descartados na
criação; sem validação de URL/tamanho; sem máquina de estados.

Fluxo: PENDENTE -> (staff) ORCADO -> (cliente aprova em /api/gerar_pix)
AGUARDANDO_PAGAMENTO -> (webhook Asaas) ATIVO. CANCELADO/REJEITADO/EXPIRADO finais.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vt_core import asaas, audit, config, validation as v
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler

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
        raise ApiError(400, "Ação GET inválida.")

    def post(self, ctx):
        acao = ctx.json(limite=600 * 1024).get("acao")
        d = ctx.json(limite=600 * 1024)
        db = get_db()

        if acao == "criar":
            p = ctx.exigir()
            if p.tipo == "CLIENTE":
                cliente = p.rec
            else:
                if not p.pode("ads:criar"):
                    raise ApiError(403, "Seu perfil não tem permissão para esta ação.", "proibido")
                cliente = db.cliente.find_unique(where={"id": str(d.get("usuarioId") or "")})
                if not cliente:
                    raise ApiError(404, "Cliente não encontrado.")
            img = v.imagem_banner(d.get("arquivo_base64"), config.LIMITE_BANNER_BYTES)
            data = {
                "usuarioId": cliente.id, "empresa_nome": cliente.nomeEmpresa,
                "email_contato": cliente.emailAcesso,
                "link_destino": v.url_http(d.get("link_destino"), "Link de destino"),
                "tema": v.texto(d.get("tema"), "Tema", 10, 280),
                "localExibicao": v.escolha(d.get("localExibicao", "CABECALHO"), config.LOCAIS_ADS, "Local"),
                "status": "PENDENTE", "valorOrcamento": 0.0}
            if img:
                data["bannerMime"], data["bannerDados"] = img
            if db.campanhaads.count(where={"usuarioId": cliente.id, "status": "PENDENTE"}) >= 5:
                raise ApiError(429, "Você já tem 5 pedidos pendentes. Aguarde a análise.", "limite")
            nova = db.campanhaads.create(data=data)
            if img:
                db.campanhaads.update(where={"id": nova.id}, data={"bannerUrl": f"/api/banner?id={nova.id}"})
            return {"sucesso": True, "id": nova.id}

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
