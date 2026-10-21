import json
import sys
import os

# Força o Python a enxergar a pasta raiz do projeto na Vercel
pasta_raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if pasta_raiz not in sys.path:
    sys.path.append(pasta_raiz)
    
from http.server import BaseHTTPRequestHandler
from prisma_db import Prisma
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):
    
    def do_GET(self):
        db = Prisma()
        try:
            db.connect()
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            cliente_id = query_params.get('clienteId', [None])[0]
            
            if not cliente_id:
                self._send_response(400, {'erro': 'ID do cliente não fornecido.'})
                return
                
            regras = db.regracliente.find_many(
                where={"clienteId": cliente_id},
                order={"criadoEm": "desc"}
            )
            
            lista = []
            for r in regras:
                lista.append({
                    "id": r.id, "nomeRegra": r.nomeRegra, "tipoGuia": r.tipoGuia, 
                    "campoValidado": r.campoValidado, "condicao": r.condicao, 
                    "valorEsperado": r.valorEsperado, "acao": r.acao, "mensagemErro": r.mensagemErro
                })
                
            self._send_response(200, lista)
            
        except Exception as e:
            self._send_response(500, {'erro': str(e)})
        finally:
            if db.is_connected(): db.disconnect()

    def do_POST(self):
        db = Prisma()
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            dados = json.loads(post_data.decode('utf-8'))
            
            acao_req = dados.get('acao_req', 'criar')
            db.connect()
            
            if acao_req == 'excluir':
                regra_id = dados.get('id')
                db.regracliente.delete(where={"id": regra_id})
                self._send_response(200, {'sucesso': True, 'mensagem': 'Regra excluída com sucesso.'})
                
            elif acao_req == 'editar':
                regra_id = dados.get('id')
                db.regracliente.update(
                    where={"id": regra_id},
                    data={
                        "nomeRegra": dados.get("nomeRegra"),
                        "tipoGuia": dados.get("tipoGuia"),
                        "campoValidado": dados.get("campoValidado"),
                        "condicao": dados.get("condicao"),
                        "valorEsperado": dados.get("valorEsperado"),
                        "acao": dados.get("acao"),
                        "mensagemErro": dados.get("mensagemErro")
                    }
                )
                self._send_response(200, {'sucesso': True, 'mensagem': 'Regra atualizada com sucesso.'})
                
            else: # Criar nova regra
                nova_regra = db.regracliente.create(data={
                    "clienteId": dados.get("clienteId"),
                    "nomeRegra": dados.get("nomeRegra"),
                    "tipoGuia": dados.get("tipoGuia"),
                    "campoValidado": dados.get("campoValidado"),
                    "condicao": dados.get("condicao"),
                    "valorEsperado": dados.get("valorEsperado"),
                    "acao": dados.get("acao"),
                    "mensagemErro": dados.get("mensagemErro")
                })
                self._send_response(200, {'sucesso': True, 'id': nova_regra.id})
            
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': str(e)})
        finally:
            if db.is_connected(): db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))
