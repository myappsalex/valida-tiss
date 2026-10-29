"""Cria o primeiro ADMIN (rode uma vez, localmente, com DATABASE_URL).
Uso: python scripts/criar_admin.py "Nome" email@dominio.com
A senha provisória é impressa UMA vez; a troca é exigida no primeiro login."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from vt_core import security
from vt_core.db import get_db

if len(sys.argv) != 3:
    sys.exit(__doc__)
nome, email = sys.argv[1], security.normalizar_email(sys.argv[2])
db = get_db()
if db.usuario.find_unique(where={"email": email}):
    sys.exit("Já existe um usuário com este e-mail.")
temp = security.gerar_senha_temporaria()
db.usuario.create(data={"nome": nome, "email": email, "perfil": "ADMIN", "status": "ATIVO",
                        "senhaHash": security.hash_senha(temp), "mustChangePassword": True})
print(f"ADMIN criado: {email}\nSenha provisória: {temp}")
