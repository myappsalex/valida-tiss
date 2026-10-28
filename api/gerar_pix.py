import os
import json
import requests
from http.server import BaseHTTPRequestHandler
from datetime import datetime, timedelta

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            dados = json.loads(post_data.decode('utf-8'))
            
            # Aqui você buscaria o ID do cliente no Asaas salvo na sua base, ou criaria um na hora
            cliente_asaas_id = dados.get('clienteAsaasId') # Ex: cus_00000503...
            valor = dados.get('valor')
            descricao = dados.get('descricao', 'Pagamento ValidaTISS')
            id_referencia = dados.get('referenciaId') # O ID da campanha ou assinatura no seu banco
            
            headers = {
                "accept": "application/json",
                "content-type": "application/json",
                "access_token": os.getenv("ASAAS_API_KEY")
            }
            
            # 1. Criar a cobrança via PIX
            payload_cobranca = {
                "customer": cliente_asaas_id,
                "billingType": "PIX",
                "value": float(valor),
                "dueDate": (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d'),
                "description": descricao,
                "externalReference": str(id_referencia) # Fundamental para o Webhook saber o que foi pago
            }
            
            url_base = os.getenv("ASAAS_API_URL")
            resp_cobranca = requests.post(f"{url_base}/payments", json=payload_cobranca, headers=headers)
            
            if resp_cobranca.status_code != 200:
                self._send_response(400, {'sucesso': False, 'erro': 'Falha ao criar cobrança no Asaas'})
                return
                
            cobranca_id = resp_cobranca.json().get('id')
            
            # 2. Obter o QR Code e o Copia-e-Cola dessa cobrança
            resp_qr = requests.get(f"{url_base}/payments/{cobranca_id}/pixQrCode", headers=headers)
            dados_pix = resp_qr.json()
            
            resposta = {
                'sucesso': True,
                'cobrancaId': cobranca_id,
                'payload_pix': dados_pix.get('payload'), # O Copia e Cola
                'imagem_qrcode': dados_pix.get('encodedImage') # Base64 do QR Code para o HTML
            }
            self._send_response(200, resposta)
            
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': str(e)})

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))