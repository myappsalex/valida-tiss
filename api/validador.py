"""/api/validador – validação XSD do XML TISS.

Corrige: XXE (lxml resolve entidades por padrão); XSD recompilado a cada
requisição; versão desconhecida caía silenciosamente no XSD 4.03.00; schemas
buscados via os.getcwd(); acentos corrompidos quando o XML declara ISO-8859-1;
hash calculado pelo método errado e desativado; erros sem linha/caminho.
Mantém os códigos HTTP do original (200 válido / 400 inválido) para não
quebrar o validador.js.
Adiciona: Tradução de erros brutos do XSD para mensagens claras ao usuário.
"""
import os
import re
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from functools import lru_cache
from pathlib import Path

from lxml import etree

from vt_core import config, tiss
from vt_core.web import ApiError, ApiHandler

RAIZ = Path(__file__).resolve().parent.parent
MAX_ERROS = 200

# Dicionário DE>PARA para traduzir erros comuns e nomes de tags do namespace
TRADUCOES_XSD = {
    "{http://www.ans.gov.br/padroes/tiss/schemas}": "",  # Remove o namespace longo
    "Missing child element(s). Expected is one of": "Está faltando uma tag obrigatória dentro desta estrutura. É esperado uma destas:",
    "Missing child element(s). Expected is": "Está faltando uma tag obrigatória. É esperado a tag",
    "This element is not expected. Expected is": "Esta tag não é esperada neste local ou está fora de ordem. A tag correta esperada aqui é",
    "This element is not expected.": "Esta tag não é permitida ou não é esperada neste local.",
    "Element": "A tag",
}

def traduzir_mensagem_xsd(mensagem_bruta):
    """Traduz a mensagem de erro bruta do lxml/XSD para uma linguagem amigável."""
    mensagem = mensagem_bruta
    
    # 1. Substitui os termos em inglês e namespaces usando o dicionário
    for de, para in TRADUCOES_XSD.items():
        mensagem = mensagem.replace(de, para)
        
    # 2. Envolve os nomes das tags restantes em formatação de tag HTML visual (opcional, mas ajuda na UI)
    # Exemplo: transforma "destino:" em "<destino>:" ou apenas destaca.
    # O regex procura palavras soltas que parecem nomes de tags (letras e números) 
    # que sobraram após remover o namespace.
    mensagem = re.sub(r'\'([a-zA-Z0-9_]+)\'', r'<\1>', mensagem)
    mensagem = re.sub(r'\( ([a-zA-Z0-9_]+) \)', r'<\1>', mensagem)
    mensagem = re.sub(r'\( ([a-zA-Z0-9_, ]+) \)', lambda m: m.group(0).replace(' ', '').replace(',', ' ou <') + '>', mensagem)
    
    # Limpeza de formatações residuais do regex acima
    mensagem = mensagem.replace('(<', '(<').replace('> ou <', '> ou <')
    
    # 3. Tratamento para erros de "This element is not expected" quando a lista esperada está vazia
    if "A tag correta esperada aqui é (  )" in mensagem:
        mensagem = mensagem.replace("A tag correta esperada aqui é (  )", "Nenhuma outra tag é esperada dentro deste elemento.")

    return mensagem.strip()


@lru_cache(maxsize=8)
def _schema(arquivo):
    caminho = RAIZ / "schemas" / arquivo
    if not caminho.exists():
        caminho = Path(os.getcwd()) / "schemas" / arquivo
    if not caminho.exists():
        return None
    try:
        return etree.XMLSchema(etree.parse(str(caminho)))  # caminho: resolve xs:include relativo
    except (etree.XMLSchemaParseError, OSError):
        return None   # pacote XSD incompleto (ex.: 3.02.x da ANS referencia um tipo que não vem nos arquivos)


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
        
        # Abordagem Híbrida: Captura a versão declarada, mesmo se ela não estiver na lista de suportadas
        versao = declarada if declarada else solicitada or config.VERSAO_TISS_PADRAO
        
        aviso_versao = None
        if declarada and solicitada and declarada != solicitada:
            aviso_versao = f"O arquivo declara a versão {declarada}; validado contra ela (você selecionou {solicitada})."
        
        arquivo_xsd = config.VERSOES_TISS.get(versao)
        schema = _schema(arquivo_xsd) if arquivo_xsd else None

        avisos = [aviso_versao] if aviso_versao else []
        informado, calculado = tiss.hash_informado(raiz), tiss.calcular_hash(raiz)
        if informado and informado != calculado:
            avisos.append(f"Hash do epílogo divergente (informado {informado}, calculado {calculado}). "
                          "Se você editou o arquivo, recalcule o hash antes de enviar à operadora.")

        if schema is None:
            # Não temos o XSD (ex: 3.02.00 descontinuada). Devolve como válido para o frontend poder extrair os valores e exibir o Alerta Crítico.
            avisos.append(f"Validação estrutural XSD ignorada (versão {versao} não possui schema local).")
            return {"valido": True, "versao": versao, "avisos": avisos,
                    "mensagem": f"XML versão {versao} carregado para leitura!"}

        if schema.validate(raiz):
            return {"valido": True, "versao": versao, "avisos": avisos,
                    "mensagem": f"XML válido segundo o padrão TISS {versao}!"}
                    
        log = list(schema.error_log)[:MAX_ERROS]
        detalhes = []
        for e in log:
            # Aplica a função de tradução na mensagem original do XSD
            mensagem_traduzida = traduzir_mensagem_xsd(e.message)
            detalhes.append({
                "linha": e.line, 
                "coluna": e.column, 
                "caminho": e.path, 
                "mensagem": mensagem_traduzida,
                "mensagem_original": e.message # Opcional: mantemos a original para debug se necessário
            })
            
        return (400, {"valido": False, "versao": versao, "avisos": avisos,
                      "erros": [f"Linha {x['linha']}: {x['mensagem']}" for x in detalhes],
                      "detalhes": detalhes, "truncado": len(schema.error_log) > MAX_ERROS})