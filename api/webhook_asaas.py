import json
from http.server import BaseHTTPRequestHandler
from prisma import Prisma

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        db = Prisma()
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            payload = json.loads(post_data.decode('utf-8'))
            
            evento = payload.get('event')
            pagamento = payload.get('payment', {})
            
            # O Asaas envia vários eventos, só nos interessa quando o dinheiro cai
            if evento == 'PAYMENT_RECEIVED':
                id_referencia = pagamento.get('externalReference')
                
                if id_referencia:
                    db.connect()
                    
                    # Exemplo: Atualizar status de uma Campanha de Publicidade
                    if id_referencia.startswith('AD_'):
                        id_campanha = id_referencia.replace('AD_', '')
                        # db.campanhaads.update(where={"id": id_campanha}, data={"status": "ATIVO"})
                        
                    # Exemplo: Atualizar Assinatura de um Cliente
                    elif id_referencia.startswith('ASSINATURA_'):
                        id_cliente = id_referencia.replace('ASSINATURA_', '')
                        # db.usuario.update(where={"id": id_cliente}, data={"statusPagamento": "ATIVO"})
            
            # O Asaas exige que o seu servidor responda 200 OK rapidamente, senão ele fica tentando reenviar
            self._send_response(200, {'recebido': True})
            
        except Exception as e:
            self._send_response(500, {'erro': str(e)})
        finally:
            if db.is_connected(): db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))