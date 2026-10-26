import json
from http.server import BaseHTTPRequestHandler
from prisma import Prisma
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        db = Prisma()
        try:
            db.connect()
            parsed_path = urlparse(self.path)
            query_params = parse_qs(parsed_path.query)
            codigo = query_params.get('codigo', [''])[0]
            termo = query_params.get('termo', [''])[0]
            
            where_clause = {}
            if codigo:
                where_clause['codigoTermo'] = {'contains': codigo}
            if termo:
                where_clause['termo'] = {'contains': termo, 'mode': 'insensitive'}

            # Limite de 100 para evitar travamentos no front-end em pesquisas genéricas
            resultados = db.dominiotuss.find_many(where=where_clause, take=100)
            
            lista = []
            for r in resultados:
                lista.append({
                    "id": r.id, "codigoTabela": r.codigoTabela, "codigoTermo": r.codigoTermo,
                    "termo": r.termo, "registroAnvisa": r.registroAnvisa, "ativo": r.ativo,
                    "fabricante": getattr(r, 'fabricante', ''),
                    "apresentacaoModelo": getattr(r, 'apresentacaoModelo', ''),
                    "classeRisco": getattr(r, 'classeRisco', '')
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

            if acao == 'excluir':
                db.dominiotuss.delete(where={"id": dados.get('id')})
                self._send_response(200, {'sucesso': True})
            elif acao == 'editar':
                db.dominiotuss.update(
                    where={"id": dados.get('id')},
                    data={
                        "codigoTabela": dados.get("codigoTabela"),
                        "codigoTermo": dados.get("codigoTermo"),
                        "termo": dados.get("termo"),
                        "registroAnvisa": dados.get("registroAnvisa") or None,
                        "fabricante": dados.get("fabricante") or None,
                        "apresentacaoModelo": dados.get("apresentacaoModelo") or None,
                        "classeRisco": dados.get("classeRisco") or None
                    }
                )
                self._send_response(200, {'sucesso': True})
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': str(e)})
        finally:
            if db.is_connected(): db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

# (Adicione este bloco logo acima do `elif acao == 'excluir':` no do_POST)
            if acao == 'validar_lote':
                codigos_para_validar = dados.get('codigos', [])
                if not codigos_para_validar:
                    self._send_response(200, [])
                    return
                
                # Busca rápida no banco
                encontrados = db.dominiotuss.find_many(
                    where={"codigoTermo": {"in": codigos_para_validar}},
                    select={"codigoTermo": True}
                )
                
                # Cria uma lista apenas com os códigos que existem
                lista_validos = [item.codigoTermo for item in encontrados]
                self._send_response(200, lista_validos)
                return