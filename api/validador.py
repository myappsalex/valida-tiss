"""/api/validador – validação XSD do XML TISS.

Corrige: XXE (lxml resolve entidades por padrão); XSD recompilado a cada
requisição; versão desconhecida caía silenciosamente no XSD 4.03.00; schemas
buscados via os.getcwd(); acentos corrompidos quando o XML declara ISO-8859-1;
hash calculado pelo método errado e desativado; erros sem linha/caminho.
Mantém os códigos HTTP do original (200 válido / 400 inválido) para não
quebrar o validador.js.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from functools import lru_cache
from pathlib import Path

from lxml import etree

from vt_core import config, tiss
from vt_core.web import ApiError, ApiHandler

RAIZ = Path(__file__).resolve().parent.parent
MAX_ERROS = 200


@lru_cache(maxsize=8)
def _schema(arquivo):
    caminho = RAIZ / "schemas" / arquivo
    if not caminho.exists():
        caminho = Path(os.getcwd()) / "schemas" / arquivo
    if not caminho.exists():
        return None
    return etree.XMLSchema(etree.parse(str(caminho)))  # caminho: resolve xs:include relativo


def _parser():
    return etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False,
                           dtd_validation=False, huge_tree=False, recover=False)


class handler(ApiHandler):
    def post(self, ctx):
        d = ctx.json(limite=config.LIMITE_XML_BYTES + 4096)
        xml = d.get("xml", "")
        if not isinstance(xml, str) or not xml.strip():
            raise ApiError(400, "XML ausente.")
        bruto = tiss.remover_declaracao(xml).encode("utf-8")
        if len(bruto) > config.LIMITE_XML_BYTES:
            raise ApiError(413, "XML acima do limite de 4 MB para validação online.")
        if b"<!DOCTYPE" in bruto.upper() or b"<!ENTITY" in bruto.upper():
            return (400, {"valido": False, "erros": ["DTD/entidades não são permitidas em arquivos TISS."]})
        try:
            raiz = etree.fromstring(bruto, parser=_parser())
        except etree.XMLSyntaxError as e:
            return (400, {"valido": False, "erros": [f"Erro de sintaxe no XML (linha {e.lineno}): {e.msg}"]})

        solicitada = str(d.get("versao") or "")
        declarada = tiss.versao_declarada(raiz)
        versao = declarada if declarada in config.VERSOES_TISS else solicitada or config.VERSAO_TISS_PADRAO
        if versao not in config.VERSOES_TISS:
            return (400, {"valido": False, "erros": [f"Versão TISS não suportada: {versao}."]})
        aviso_versao = None
        if declarada and solicitada and declarada != solicitada:
            aviso_versao = f"O arquivo declara a versão {declarada}; validado contra ela (você selecionou {solicitada})."
        schema = _schema(config.VERSOES_TISS[versao])
        if schema is None:
            raise ApiError(500, "Schema desta versão indisponível no servidor.")

        avisos = [aviso_versao] if aviso_versao else []
        informado, calculado = tiss.hash_informado(raiz), tiss.calcular_hash(raiz)
        if informado and informado != calculado:
            avisos.append(f"Hash do epílogo divergente (informado {informado}, calculado {calculado}). "
                          "Se você editou o arquivo, recalcule o hash antes de enviar à operadora.")

        if schema.validate(raiz):
            return {"valido": True, "versao": versao, "avisos": avisos,
                    "mensagem": f"XML válido segundo o padrão TISS {versao}!"}
        log = list(schema.error_log)[:MAX_ERROS]
        detalhes = [{"linha": e.line, "coluna": e.column, "caminho": e.path, "mensagem": e.message} for e in log]
        return (400, {"valido": False, "versao": versao, "avisos": avisos,
                      "erros": [f"Linha {x['linha']}: {x['mensagem']}" for x in detalhes],
                      "detalhes": detalhes, "truncado": len(schema.error_log) > MAX_ERROS})
