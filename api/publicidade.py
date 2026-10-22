import json
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from prisma import Prisma
from datetime import datetime

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        db = Prisma()
        try:
            db.connect()
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            acao = query_params.get('acao', [''])[0]
            
            if acao == 'listar':
                cliente = query_params.get('cliente', [''])[0]
                status = query_params.get('status', [''])[0]
                where_clause = {}
                if cliente: where_clause['empresa_nome'] = {'contains': cliente, 'mode': 'insensitive'}
                if status: where_clause['status'] = status
                resultados = db.campanhaads.find_many(where=where_clause)
                
            elif acao == 'listar_minhas':
                cliente_id = query_params.get('clienteId', [''])[0]
                if not cliente_id:
                    self._send_response(400, {'erro': 'ID não informado.'})
                    return
                resultados = db.campanhaads.find_many(where={'usuarioId': cliente_id})
            else:
                self._send_response(400, {'erro': 'Ação GET inválida.'})
                return

            lista = []
            for r in resultados:
                dt_inicio = r.dataInicio.isoformat() if getattr(r, 'dataInicio', None) else ""
                dt_fim = r.dataFim.isoformat() if getattr(r, 'dataFim', None) else ""
                
                lista.append({
                    "id": r.id,
                    "empresa_nome": getattr(r, 'empresa_nome', 'Desconhecido'),
                    "tema": getattr(r, 'tema', ''),
                    "status": getattr(r, 'status', 'PENDENTE'),
                    "valorOrcamento": getattr(r, 'valorOrcamento', 0.0),
                    "observacaoAdmin": getattr(r, 'observacaoAdmin', ''),
                    "dataInicio": dt_inicio,
                    "dataFim": dt_fim
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
            acao = dados.get('acao')
            db.connect()

            if acao == 'criar':
                nova = db.campanhaads.create(
                    data={
                        "usuarioId": dados.get('usuarioId'),
                        "empresa_nome": dados.get('empresa_nome'),
                        "email_contato": dados.get('email_contato'),
                        "link_destino": dados.get('link_destino'),
                        "tema": dados.get('tema'),
                        "status": "PENDENTE",
                        "valorOrcamento": 0.0
                    }
                )
                self._send_response(200, {'sucesso': True, 'id': nova.id})

            elif acao == 'avaliar':
                dt_inicio = datetime.fromisoformat(dados.get('dataInicio').replace('Z', '+00:00')) if dados.get('dataInicio') else None
                dt_fim = datetime.fromisoformat(dados.get('dataFim').replace('Z', '+00:00')) if dados.get('dataFim') else None
                    
                db.campanhaads.update(
                    where={"id": dados.get('id')},
                    data={
                        "status": dados.get('status'),
                        "observacaoAdmin": dados.get('observacaoAdmin'),
                        "valorOrcamento": float(dados.get('valorOrcamento') or 0),
                        "dataInicio": dt_inicio,
                        "dataFim": dt_fim,
                        "localExibicao": dados.get('localExibicao', 'CABECALHO') # Grava o local escolhido
                    }
)
                self._send_response(200, {'sucesso': True})

            elif acao == 'resposta_cliente':
                db.campanhaads.update(where={"id": dados.get('id')}, data={"status": dados.get('status')})
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