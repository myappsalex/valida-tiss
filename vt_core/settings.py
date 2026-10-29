"""Configurações de negócio editáveis pelo painel admin (tabela `Configuracao`).

Ordem de leitura: banco -> variável de ambiente -> padrão. O banco vence para que o
reajuste de preço tenha efeito imediato, sem novo deploy e sem token da API da Vercel.
Guarda também o valor ANTERIOR: pagamentos PIX gerados antes de um reajuste continuam
sendo aceitos pelo webhook (vale o menor entre o preço atual e o anterior).
"""
from vt_core import config
from vt_core.web import ApiError

# chave -> (rótulo, mínimo, máximo, padrão, nota)
DEFINICOES = {
    "PRECO_TOKEN": ("Preço por token de IA (R$)", 0.01, 100.0, 0.15, "Compra de tokens: de 10 a 5.000 por pedido; mínimo de R$ 1,00 por cobrança."),
    "PRECO_PREMIUM_MENSAL": ("Assinatura Premium mensal (R$)", 1.0, 100000.0, None, "Vazio = assinatura online desativada."),
}


def _ler(db, chave):
    try:
        return db.configuracao.find_unique(where={"chave": chave})
    except Exception:
        return None            # tabela ainda não migrada: cai para env/padrão


def obter(db, chave):
    """float | None."""
    reg = _ler(db, chave)
    if reg is not None and reg.valor not in (None, ""):
        try:
            return float(reg.valor)
        except ValueError:
            pass
    bruto = config.env(chave)
    if bruto:
        try:
            return float(bruto)
        except ValueError:
            pass
    return DEFINICOES[chave][3]


def piso_aceito(db, chave):
    """Menor valor que o webhook aceita: cobre cobranças emitidas antes de um reajuste."""
    atual = obter(db, chave)
    reg = _ler(db, chave)
    try:
        ant = float(reg.anterior) if reg is not None and reg.anterior else None
    except ValueError:
        ant = None
    return min(x for x in (atual, ant) if x is not None) if atual is not None or ant is not None else None


def listar(db):
    out = []
    for chave, (rotulo, mn, mx, padrao, nota) in DEFINICOES.items():
        reg = _ler(db, chave)
        out.append({"chave": chave, "rotulo": rotulo, "min": mn, "max": mx, "nota": nota,
                    "valor": obter(db, chave), "origem": "banco" if reg is not None and reg.valor not in (None, "") else ("ambiente" if config.env(chave) else "padrão"),
                    "atualizadoPor": getattr(reg, "atualizadoPor", None) if reg else None,
                    "atualizadoEm": reg.atualizadoEm.isoformat() if reg is not None and getattr(reg, "atualizadoEm", None) else None})
    return out


def salvar(db, ator_email, chave, valor):
    """valor None/"" = remove do banco (volta para env/padrão)."""
    if chave not in DEFINICOES:
        raise ApiError(422, "Configuração desconhecida.", "validacao")
    rotulo, mn, mx, _, _ = DEFINICOES[chave]
    antes = obter(db, chave)
    reg = _ler(db, chave)
    if valor in (None, ""):
        if reg is not None:
            db.configuracao.delete(where={"chave": chave})
        return antes, obter(db, chave)
    try:
        novo = round(float(valor), 2)
    except (TypeError, ValueError):
        raise ApiError(422, f"{rotulo}: valor inválido.", "validacao")
    if isinstance(valor, bool) or novo != novo or novo < mn or novo > mx:
        raise ApiError(422, f"{rotulo}: informe um valor entre {mn:g} e {mx:g}.", "validacao")
    dados = {"valor": f"{novo:.2f}", "atualizadoPor": ator_email}
    if antes is not None and abs(antes - novo) > 1e-9:
        dados["anterior"] = f"{antes:.2f}"
    if reg is None:
        db.configuracao.create(data={"chave": chave, **dados})
    else:
        db.configuracao.update(where={"chave": chave}, data=dados)
    return antes, novo
