import json
from http.server import BaseHTTPRequestHandler
from prisma import Prisma
from urllib.parse import urlparse, parse_qs
import bcrypt

class handler(BaseHTTPRequestHandler):
    # --- ROTA PARA LISTAR OS UTILIZADORES (O que já tínhamos) ---
    def do_GET(self):
        db = Prisma()
        try:
            db.connect()
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            tipo_solicitado = query_params.get('tipo', ['INTERNO'])[0]
            
            lista_retorno = []
            if tipo_solicitado == 'INTERNO':
                usuarios = db.usuario.find_many(order={"criadoEm": "desc"})
                for u in usuarios:
                    lista_retorno.append({"id": u.id, "nome": u.nome, "email": u.email, "perfil": u.perfil})
            elif tipo_solicitado == 'CLIENTE':
                clientes = db.cliente.find_many(order={"criadoEm": "desc"})
                for c in clientes:
                    lista_retorno.append({"id": c.id, "nome": c.nomeEmpresa, "email": c.emailAcesso, "statusConta": c.statusConta})
                    
            self._send_response(200, lista_retorno)
        except Exception as e:
            self._send_response(500, {'erro': str(e)})
        finally:
            if db.is_connected(): db.disconnect()

    # --- NOVA ROTA: RECEBE OS COMANDOS DE EDIÇÃO, RESET E BLOQUEIO ---
    def do_POST(self):
        db = Prisma()
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            acao = data.get('acao')
            user_id = data.get('id')
            tipo = data.get('tipo')
            
            db.connect()
            
            # 1. AÇÃO: BLOQUEAR
            if acao == 'bloquear':
                if tipo == 'INTERNO':
                    db.usuario.update(where={"id": user_id}, data={"perfil": "BLOQUEADO"})
                else:
                    db.cliente.update(where={"id": user_id}, data={"statusConta": "BLOQUEADO"})
                mensagem = "Acesso revogado e bloqueado com sucesso!"
                
            # 2. AÇÃO: RESETAR SENHA
            elif acao == 'resetar':
                nova_senha_hash = bcrypt.hashpw("Mudar@123".encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
                if tipo == 'INTERNO':
                    db.usuario.update(where={"id": user_id}, data={"senhaHash": nova_senha_hash})
                else:
                    db.cliente.update(where={"id": user_id}, data={"senhaHash": nova_senha_hash})
                mensagem = "Senha redefinida com sucesso. A senha provisória é: Mudar@123"
                
            # 3. AÇÃO: EDITAR STATUS/PERFIL
            elif acao == 'editar':
                novo_valor = data.get('novo_dado', '').strip().upper()
                if tipo == 'INTERNO':
                    db.usuario.update(where={"id": user_id}, data={"perfil": novo_valor})
                else:
                    db.cliente.update(where={"id": user_id}, data={"statusConta": novo_valor})
                mensagem = f"Registo atualizado para: {novo_valor}"
                
            else:
                self._send_response(400, {'sucesso': False, 'erro': 'Comando desconhecido.'})
                return
                
            self._send_response(200, {'sucesso': True, 'mensagem': mensagem})
            
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': str(e)})
        finally:
            if db.is_connected(): db.disconnect()

    # Função auxiliar para não repetirmos código de cabeçalho
    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))