import json
from http.server import BaseHTTPRequestHandler
from prisma import Prisma
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        db = Prisma()
        try:
            db.connect()
            
            # Pega o parâmetro da URL (ex: ?tipo=INTERNO)
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            tipo_solicitado = query_params.get('tipo', ['INTERNO'])[0]
            
            lista_retorno = []
            
            if tipo_solicitado == 'INTERNO':
                usuarios = db.usuario.find_many()
                for u in usuarios:
                    lista_retorno.append({
                        "id": u.id, "nome": u.nome, "email": u.email, "perfil": u.perfil
                    })
            elif tipo_solicitado == 'CLIENTE':
                clientes = db.cliente.find_many()
                for c in clientes:
                    lista_retorno.append({
                        "id": c.id, "nome": c.nomeEmpresa, "email": c.emailAcesso, "statusConta": c.statusConta
                    })
                    
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(lista_retorno).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'erro': str(e)}).encode('utf-8'))
        finally:
            if db.is_connected():
                db.disconnect()