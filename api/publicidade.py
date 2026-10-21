import json
import base64
import os
import sys
# Força o Python a enxergar a pasta raiz do projeto na Vercel
pasta_raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if pasta_raiz not in sys.path:
    sys.path.append(pasta_raiz)
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from prisma_db import Prisma

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        db = Prisma()
        try:
            db.connect()
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            
            acao = query_params.get('acao', [''])[0]
            
            # ADMIN: Lista todas ou filtra
            if acao == 'listar':
                cliente = query_params.get('cliente', [''])[0]
                status = query_params.get('status', [''])[0]
                
                where_clause = {}
                if cliente:
                    where_clause['empresa_nome'] = {'contains': cliente, 'mode': 'insensitive'}
                if status:
                    where_clause['status'] = status
                    
                # Removida a ordenação por 'criadoEm' para evitar quebra caso o campo não exista
                resultados = db.campanhaads.find_many(where=where_clause)
                
            # CLIENTE: Lista apenas as suas campanhas
            elif acao == 'listar_minhas':
                cliente_id = query_params.get('clienteId', [''])[0]
                if not cliente_id:
                    self._send_response(400, {'erro': 'ID do cliente não informado.'})
                    return
                resultados = db.campanhaads.find_many(where={'usuarioId': cliente_id})
            else:
                self._send_response(400, {'erro': 'Ação GET inválida.'})
                return

            lista = []
            for r in resultados:
                lista.append({
                    "id": r.id,
                    "usuarioId": getattr(r, 'usuarioId', ''),
                    "empresa_nome": getattr(r, 'empresa_nome', 'Desconhecido'),
                    "tema": getattr(r, 'tema', ''),
                    "status": getattr(r, 'status', 'PENDENTE'),
                    "valorOrcamento": getattr(r, 'valorOrcamento', 0.0),
                    "observacaoAdmin": getattr(r, 'observacaoAdmin', '')
                })
            self._send_response(200, lista)
            
        except Exception as e:
            # Agora o erro real será impresso no terminal para diagnóstico
            print(f"ERRO NO BACKEND (GET /api/publicidade): {e}") 
            self._send_response(500, {'erro': str(e)})
        finally:
            if db.is_connected(): db.disconnect()

    def do_POST(self):
        db = Prisma()
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            dados = json.loads(post_data.decode('utf-8'))
            
            acao = dados.get('acao')
            db.connect()

            if acao == 'criar':
                url_banner = None
                if dados.get('arquivo_base64'):
                    url_banner = "upload_pendente"

                nova_campanha = db.campanhaads.create(
                    data={
                        "usuarioId": dados.get('usuarioId'),
                        "empresa_nome": dados.get('empresa_nome'),
                        "email_contato": dados.get('email_contato'),
                        "link_destino": dados.get('link_destino'),
                        "tema": dados.get('tema'),
                        "bannerUrl": url_banner,
                        "status": "PENDENTE",
                        "valorOrcamento": 0.0
                    }
                )
                self._send_response(200, {'sucesso': True, 'id': nova_campanha.id})

            elif acao == 'avaliar':
                db.campanhaads.update(
                    where={"id": dados.get('id')},
                    data={
                        "status": dados.get('status'),
                        "observacaoAdmin": dados.get('observacaoAdmin'),
                        "valorOrcamento": float(dados.get('valorOrcamento') or 0)
                    }
                )
                self._send_response(200, {'sucesso': True})

            elif acao == 'resposta_cliente':
                db.campanhaads.update(
                    where={"id": dados.get('id')},
                    data={"status": dados.get('status')}
                )
                self._send_response(200, {'sucesso': True})

            else:
                self._send_response(400, {'sucesso': False, 'erro': 'Ação POST inválida.'})

        except Exception as e:
            print(f"ERRO NO BACKEND (POST /api/publicidade): {e}")
            self._send_response(500, {'sucesso': False, 'erro': str(e)})
        finally:
            if db.is_connected(): db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))