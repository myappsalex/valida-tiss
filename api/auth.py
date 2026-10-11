import json
from http.server import BaseHTTPRequestHandler
from prisma import Prisma
import bcrypt

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # Instancia o Prisma Client
        db = Prisma()
        
        try:
            # Lê o corpo da requisição enviada pelo JavaScript
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            acao = data.get('acao')
            email = data.get('email')
            senha = data.get('senha')
            
            # Abre a ligação à base de dados PostgreSQL
            db.connect()
            
            if acao == 'registro':
                nome = data.get('nome')
                
                # Verifica se o e-mail já existe
                existente = db.cliente.find_unique(where={"emailAcesso": email})
                if existente:
                    self._send_response(400, {'sucesso': False, 'erro': 'Este e-mail já está registado.'})
                    return
                
                # Encripta a palavra-passe (Hashing)
                salt = bcrypt.gensalt()
                senha_hash = bcrypt.hashpw(senha.encode('utf-8'), salt).decode('utf-8')
                
                # Cria o novo cliente na tabela
                novo_cliente = db.cliente.create(data={
                    "nomeEmpresa": nome,
                    "emailAcesso": email,
                    "senhaHash": senha_hash,
                    "tokensIA": 0,
                    "statusConta": "PENDENTE"
                })
                
                self._send_response(200, {'sucesso': True, 'mensagem': 'Conta criada com sucesso! Aguarde a aprovação do administrador.'})
            
            elif acao == 'login':
                # Procura o cliente pelo e-mail
                cliente = db.cliente.find_unique(where={"emailAcesso": email})
                
                if not cliente:
                    self._send_response(401, {'sucesso': False, 'erro': 'Credenciais inválidas.'})
                    return
                    
                # Compara a palavra-passe digitada com o Hash gravado
                if bcrypt.checkpw(senha.encode('utf-8'), cliente.senhaHash.encode('utf-8')):
                    # Sucesso: Monta o pacote de dados do utilizador (NUNCA devolver a senha)
                    dados_usuario = {
                        "id": cliente.id,
                        "nome": cliente.nomeEmpresa,
                        "email": cliente.emailAcesso,
                        "tokensRestantes": cliente.tokensIA,
                        "statusPagamento": cliente.statusConta
                    }
                    self._send_response(200, {'sucesso': True, 'usuario': dados_usuario})
                else:
                    self._send_response(401, {'sucesso': False, 'erro': 'Credenciais inválidas.'})
                    
            else:
                self._send_response(400, {'sucesso': False, 'erro': 'Ação não reconhecida.'})
                
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': f'Erro interno: {str(e)}'})
            
        finally:
            # Garante que a ligação é fechada para não esgotar as conexões do PostgreSQL
            if db.is_connected():
                db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))