"""Cliente Prisma único por processo.

Original: cada requisição criava `Prisma()` + connect()/disconnect(). Em
serverless isso esgota conexões (o "sleep de 1,5 s" da carga TUSS era um
sintoma) e adiciona centenas de ms por chamada. Aqui o cliente é reaproveitado
enquanto a função estiver "quente". Use DATABASE_URL do *pooler*
(ex.: ...?pgbouncer=true&connection_limit=1).
"""
_db = None


def get_db():
    global _db
    if _db is None:
        from prisma import Prisma  # import tardio: facilita testes
        _db = Prisma()
    if not _db.is_connected():
        _db.connect()
    return _db


def usar_db(substituto):
    """Injeta um banco (testes)."""
    global _db
    _db = substituto
