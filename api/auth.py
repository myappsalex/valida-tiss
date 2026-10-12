import json
from http.server import BaseHTTPRequestHandler
from prisma import Prisma
import bcrypt

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        db = Prisma()
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            acao = data.get('acao')
            email = data.get('email')
            senha = data.get('senha')
            
            db.connect()
            
            # --- ÁREA DO CLIENTE EXTERNO ---
            if acao == 'registro':
                nome = data.get('nome')
                if db.cliente.find_unique(where={"emailAcesso": email}):
                    self._send_response(400, {'sucesso': False, 'erro': 'E-mail já registado como cliente.'})
                    return
                
                senha_hash = bcrypt.hashpw(senha.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                db.cliente.create(data={
                    "nomeEmpresa": nome, "emailAcesso": email, "senhaHash": senha_hash, "tokensIA": 0, "statusConta": "PENDENTE"
                })
                self._send_response(200, {'sucesso': True, 'mensagem': 'Conta de cliente criada com sucesso!'})
            
            elif acao == 'login':
                cliente = db.cliente.find_unique(where={"emailAcesso": email})
                if not cliente or not bcrypt.checkpw(senha.encode('utf-8'), cliente.senhaHash.encode('utf-8')):
                    self._send_response(401, {'sucesso': False, 'erro': 'Credenciais de cliente inválidas.'})
                    return
                self._send_response(200, {'sucesso': True, 'usuario': {
                    "id": cliente.id, "nome": cliente.nomeEmpresa, "email": cliente.emailAcesso, 
                    "tokensRestantes": cliente.tokensIA, "statusPagamento": cliente.statusConta, "tipo": "CLIENTE"
                }})

            # --- ÁREA ADMINISTRATIVA (USUÁRIOS INTERNOS) ---
            elif acao == 'registro_admin':
                nome = data.get('nome')
                perfil = data.get('perfil', 'OPERACAO') # Padrão caso não seja enviado
                
                if db.usuario.find_unique(where={"email": email}):
                    self._send_response(400, {'sucesso': False, 'erro': 'E-mail administrativo já em uso.'})
                    return
                
                senha_hash = bcrypt.hashpw(senha.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                db.usuario.create(data={
                    "nome": nome, "email": email, "senhaHash": senha_hash, "perfil": perfil
                })
                self._send_response(200, {'sucesso': True, 'mensagem': 'Usuário administrativo cadastrado com sucesso!'})

            # --- ÁREA ADMINISTRATIVA (USUÁRIOS INTERNOS) ---
            elif acao == 'login_admin':
                # Remove espaços em branco que o utilizador possa ter digitado sem querer
                email_limpo = email.strip() if email else ""
                
                usuario = db.usuario.find_unique(where={"email": email_limpo})
                
                # Teste 1: O e-mail existe no banco?
                if not usuario:
                    self._send_response(401, {'sucesso': False, 'erro': f"O e-mail '{email_limpo}' não foi encontrado no banco de dados."})
                    return
                
                # Teste 2: A senha bate com a criptografia?
                if not bcrypt.checkpw(senha.encode('utf-8'), usuario.senhaHash.encode('utf-8')):
                    self._send_response(401, {'sucesso': False, 'erro': 'O e-mail foi encontrado, mas a senha está incorreta.'})
                    return
                
                # Sucesso!
                self._send_response(200, {'sucesso': True, 'usuario': {
                    "id": usuario.id, "nome": usuario.nome, "email": usuario.email, "perfil": usuario.perfil, "tipo": "INTERNO"
                }})
                
            else:
                self._send_response(400, {'sucesso': False, 'erro': 'Ação não reconhecida.'})
                
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': f'Erro interno: {str(e)}'})
        finally:
            if db.is_connected():
                db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))