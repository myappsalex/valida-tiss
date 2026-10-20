import json
import base64
import os
import uuid
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from prisma import Prisma

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
                    
                resultados = db.campanhaads.find_many(where=where_clause, order={'criadoEm': 'desc'})
                
            # CLIENTE: Lista apenas as suas campanhas
            elif acao == 'listar_minhas':
                cliente_id = query_params.get('clienteId', [''])[0]
                if not cliente_id:
                    self._send_response(400, {'erro': 'ID do cliente não informado.'})
                    return
                resultados = db.campanhaads.find_many(where={'usuarioId': cliente_id}, order={'criadoEm': 'desc'})
            else:
                self._send_response(400, {'erro': 'Ação GET inválida.'})
                return

            lista = []
            for r in resultados:
                lista.append({
                    "id": r.id,
                    "usuarioId": r.usuarioId,
                    "empresa_nome": r.empresa_nome,
                    "tema": r.tema,
                    "status": r.status,
                    "valorOrcamento": r.valorOrcamento,
                    "observacaoAdmin": r.observacaoAdmin
                })
            self._send_response(200, lista)
            
        except Exception as e:
            self._send_response(200, []) # Retorna array vazio em caso de erro (ex: tabela vazia)
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

            # CLIENTE/ADMIN: Cria novo pedido de orçamento
            if acao == 'criar':
                url_banner = None
                # Simulação do Cloudflare R2 (o upload real entra aqui posteriormente)
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

            # ADMIN: Avalia e envia orçamento ou recusa
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

            # CLIENTE: Aprova e avança para PIX, ou Cancela
            elif acao == 'resposta_cliente':
                db.campanhaads.update(
                    where={"id": dados.get('id')},
                    data={"status": dados.get('status')}
                )
                self._send_response(200, {'sucesso': True})

            else:
                self._send_response(400, {'sucesso': False, 'erro': 'Ação POST inválida.'})

        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': str(e)})
        finally:
            if db.is_connected(): db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))