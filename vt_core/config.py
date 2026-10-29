"""Configuração e constantes de domínio (única fonte de verdade).

As listas abaixo substituem strings "mágicas" espalhadas pelo código original
(ex.: 'ATIVO', 'BLOQUEADO', 'ADMIN') e são usadas tanto na validação de entrada
quanto na montagem de respostas.
"""
import os


class ConfigError(RuntimeError):
    """Variável de ambiente obrigatória ausente/inválida (falha fechada)."""


def env(nome, padrao=None):
    valor = os.environ.get(nome)
    return valor if valor not in (None, "") else padrao


def dev_inseguro():
    """Só para `vercel dev`/localhost sem HTTPS. NUNCA em produção."""
    return env("VT_DEV_INSECURE") == "1"


def session_secret():
    segredo = env("SESSION_SECRET")
    if not segredo or len(segredo) < 32:
        raise ConfigError("SESSION_SECRET ausente ou com menos de 32 caracteres.")
    return segredo


# --- Sessão -----------------------------------------------------------------
SESSAO_TTL_SEGUNDOS = 8 * 3600
COOKIE_SESSAO_SEGURO = "__Host-vt_sess"   # exige Secure + Path=/ + sem Domain
COOKIE_SESSAO_DEV = "vt_sess"

# --- Login: bloqueio temporário por conta ----------------------------------
LOGIN_MAX_FALHAS = 5
LOGIN_BLOQUEIO_MINUTOS = 15

# --- Enumerações de domínio -------------------------------------------------
PERFIS_INTERNOS = ("ADMIN", "OPERACAO", "PUBLICIDADE", "GESTAO")
STATUS_INTERNO = ("ATIVO", "BLOQUEADO", "CANCELADO")
STATUS_CLIENTE = ("PENDENTE", "ATIVO", "BLOQUEADO", "CANCELADO")
PLANOS = ("FREEMIUM", "PREMIUM")
STATUS_PAGAMENTO = ("ATIVO", "INATIVO")
LOCAIS_ADS = ("CABECALHO", "LATERAL")
TOKENS_MIN, TOKENS_MAX = 10, 5000
STATUS_COMPRA_TOKENS = ("AGUARDANDO", "PAGO", "CANCELADO")
STATUS_ADS = ("PENDENTE", "ORCADO", "AGUARDANDO_PAGAMENTO", "ATIVO",
              "CANCELADO", "REJEITADO", "EXPIRADO")
STATUS_ADS_ABERTOS = ("PENDENTE", "ORCADO", "AGUARDANDO_PAGAMENTO")
TABELAS_TUSS = ("18", "19", "20", "22")
PROVEDORES_IA = ("gemini", "chatgpt", "deepseek")

# Regras de negócio do cliente (alinhadas às opções do dashboard_cliente.html)
TIPOS_GUIA = ("TODAS", "guiaSP-SADT", "guiaConsulta",
              "guiaResumoInternacao", "guiaHonorarioIndividual")
CAMPOS_REGRA = ("valorTotalGeral", "codigoProcedimento", "quantidadeDespesa",
                "tipoDespesa", "grauParticipacao")
CONDICOES_REGRA = ("MAIOR_QUE", "IGUAL", "CONTEM")
ACOES_REGRA = ("ALERTA", "BLOQUEIO")
MAX_REGRAS_POR_CLIENTE = 200

# Versões do padrão TISS -> arquivo XSD em /schemas
VERSOES_TISS = {
    "4.03.00": "tissV4_03_00.xsd",
    "4.02.00": "tissV4_02_00.xsd",
    "4.01.00": "tissV4_01_00.xsd",
    "3.03.02": "tissV3_03_02.xsd",
    "3.03.01": "tissV3_03_01.xsd",
    "3.03.00": "tissV3_03_00.xsd",
    "3.02.02": "tissV3_02_02.xsd",
    "3.02.01": "tissV3_02_01.xsd",
}
VERSAO_TISS_PADRAO = "4.03.00"

# Limites de payload (a Vercel recusa corpos > 4,5 MB de qualquer forma)
LIMITE_JSON_PADRAO = 64 * 1024
LIMITE_XML_BYTES = 4 * 1024 * 1024
LIMITE_CSV_BYTES = 4 * 1024 * 1024
LIMITE_BANNER_BYTES = 300 * 1024
