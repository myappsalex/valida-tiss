"""/api/carga_tuss – carga incremental de domínios TUSS por CSV (staff).

Mantém a lógica de delta do original (boa), corrigindo: sem autenticação;
`tabela` sem lista permitida; corpo sem limite; datas ingênuas; conexão por
requisição (origem do "sleep 1,5 s" no front); duplicidade por corrida.
"""
import csv
import io
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone

from vt_core import audit, config, validation as v
from vt_core.db import get_db
from vt_core.web import ApiError, ApiHandler

MAX_LINHAS = 5000


def parse_data(s):
    if not s or s == "-":
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


def _chave(cod, ini, fim, fab, mod):
    f = lambda d: d.strftime("%Y-%m-%d") if d else "-"
    return (cod, f(ini), f(fim), fab or "", mod or "")


class handler(ApiHandler):
    def post(self, ctx):
        p = ctx.exigir(tipo="INTERNO", permissao="tuss:carga")
        d = ctx.json(limite=config.LIMITE_CSV_BYTES)
        tabela = v.escolha(d.get("tabela"), config.TABELAS_TUSS, "Tabela")
        bruto = d.get("csv_data")
        if not isinstance(bruto, str) or not bruto.strip():
            raise ApiError(400, "CSV ausente.")
        linhas = list(csv.DictReader(io.StringIO(bruto), delimiter=";"))
        if not linhas:
            raise ApiError(400, "Arquivo CSV vazio ou corrompido.")
        if len(linhas) > MAX_LINHAS:
            raise ApiError(413, f"Envie no máximo {MAX_LINHAS} linhas por pacote.")
        if (linhas[0].get("source") or "").strip() != f"tuss-{tabela}":
            raise ApiError(400, f'Inconsistência: tabela "{tabela}" não corresponde ao arquivo.')
        codigos = list({(r.get("id") or "").strip() for r in linhas if (r.get("id") or "").strip()})
        if not codigos:
            return {"sucesso": True, "mensagem": "Nenhum código válido neste lote."}

        db = get_db()
        existentes = {_chave(e.codigoTermo, e.vigenciaInicio, e.vigenciaFim,
                             getattr(e, "fabricante", ""), getattr(e, "apresentacaoModelo", ""))
                      for e in db.dominiotuss.find_many(where={"codigoTabela": tabela, "codigoTermo": {"in": codigos}})}
        novos = []
        for r in linhas:
            cod = (r.get("id") or "").strip()
            if not cod:
                continue
            ini, fim = parse_data((r.get("extras_inicio_vigencia") or "").strip()), parse_data((r.get("extras_fim_vigencia") or "").strip())
            fab = mod = ""
            anvisa = risco = None
            if tabela == "20":
                fab, mod = (r.get("extras_laboratorio") or "").strip(), (r.get("extras_apresentacao") or "").strip()
            elif tabela == "19":
                fab, mod = (r.get("extras_fabricante") or "").strip(), (r.get("extras_modelo") or "").strip()
                anvisa, risco = (r.get("extras_registro_anvisa") or "").strip(), (r.get("extras_classe_risco") or "").strip()
            k = _chave(cod, ini, fim, fab, mod)
            if k in existentes:
                continue
            existentes.add(k)
            reg = {"codigoTabela": tabela, "codigoTermo": cod[:20], "termo": (r.get("display_name") or "").strip()[:500],
                   "vigenciaInicio": ini, "vigenciaFim": fim, "ativo": True}
            if tabela in ("19", "20"):
                reg["fabricante"], reg["apresentacaoModelo"] = fab[:200], mod[:300]
            if tabela == "19":
                reg["registroAnvisa"], reg["classeRisco"] = anvisa, risco
            novos.append(reg)
        if not novos:
            return {"sucesso": True, "mensagem": "Delta zero: nada novo neste lote."}
        criados = db.dominiotuss.create_many(data=novos, skip_duplicates=True)
        audit.registrar(db, p, "TUSS_CARGA", "TUSS", tabela, {"criados": criados, "linhas": len(linhas)}, ctx.ip)
        return {"sucesso": True, "mensagem": f"{criados} novos registros salvos.", "criados": criados}
