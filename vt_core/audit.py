"""Trilha de auditoria das ações administrativas (tabela LogAdmin)."""
import json
import sys


def registrar(db, ator, acao, alvo_tipo, alvo_id, detalhes=None, ip=""):
    """Nunca derruba a operação principal; falhas vão para stderr.
    NUNCA passe senhas/tokens em `detalhes`."""
    try:
        db.logadmin.create(data={
            "atorTipo": ator.tipo,
            "atorId": ator.id,
            "atorEmail": ator.email,
            "acao": acao,
            "alvoTipo": alvo_tipo,
            "alvoId": str(alvo_id or ""),
            "detalhes": json.dumps(detalhes or {}, ensure_ascii=False, default=str)[:4000],
            "ip": ip or "",
        })
    except Exception as exc:  # pragma: no cover
        print(f"[audit] falha ao registrar {acao}: {type(exc).__name__}", file=sys.stderr)
