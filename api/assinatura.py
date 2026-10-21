import json
from http.server import BaseHTTPRequestHandler
from prisma import Prisma

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        db = Prisma()
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            dados = json.loads(post_data.decode('utf-8'))
            
            cliente_id = dados.get('id')
            plano = dados.get('plano')
            status_pagamento = dados.get('statusPagamento')
            
            if not cliente_id or not plano:
                self._send_response(400, {'sucesso': False, 'erro': 'Dados incompletos.'})
                return

            db.connect()
            db.usuario.update(
                where={"id": cliente_id},
                data={
                    "plano": plano,
                    "statusPagamento": status_pagamento
                }
            )
            
            self._send_response(200, {'sucesso': True, 'mensagem': 'Assinatura atualizada.'})
            
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': str(e)})
        finally:
            if db.is_connected(): db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))