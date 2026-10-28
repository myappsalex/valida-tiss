"""Utilidades TISS.

Hash do epílogo (Componente de Comunicação TISS): MD5 da concatenação dos
valores de texto de todos os elementos da mensagem, em ordem de documento,
EXCLUINDO o epílogo, codificado em ISO-8859-1. O original calculava MD5 do
C14N do <prestadorParaOperadora> (método diferente) e o desabilitou.
Valide com um arquivo aceito pela sua operadora antes de tornar bloqueante.
"""
import hashlib
import re


def _local(tag):
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def calcular_hash(raiz):
    partes = []
    for filho in raiz:
        if _local(filho.tag) == "epilogo":
            continue
        for el in filho.iter():
            if isinstance(el.tag, str) and el.text and el.text.strip():
                partes.append(el.text)
    return hashlib.md5("".join(partes).encode("iso-8859-1", errors="replace")).hexdigest()


def hash_informado(raiz):
    for el in raiz.iter():
        if _local(el.tag) == "hash" and el.getparent() is not None and _local(el.getparent().tag) == "epilogo":
            return (el.text or "").strip().lower()
    return None


def versao_declarada(raiz):
    for el in raiz.iter():
        if _local(el.tag) == "Padrao" and el.text:
            return el.text.strip()
    return None


_DECL = re.compile(r"^\s*<\?xml[^>]*\?>", re.I)


def remover_declaracao(xml_str):
    """O texto já chegou decodificado; a declaração encoding="ISO-8859-1"
    faria o lxml reinterpretar os bytes UTF-8 e corromper acentos."""
    return _DECL.sub("", xml_str, count=1)
