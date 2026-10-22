import json
import csv
import io
from http.server import BaseHTTPRequestHandler
from prisma import Prisma

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        db = Prisma()
        try:
            db.connect()
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            dados = json.loads(post_data.decode('utf-8'))
            
            tabela = dados.get('tabela')
            csv_raw = dados.get('csv_data')
            
            if not tabela or not csv_raw:
                self._send_response(400, {'sucesso': False, 'erro': 'Tabela ou arquivo CSV não fornecidos.'})
                return

            # Substituímos DictReader por reader comum para ler por posição (0, 1, 2) ignorando os nomes do cabeçalho
            reader = csv.reader(io.StringIO(csv_raw), delimiter=';')
            next(reader, None) # Pula a primeira linha (cabeçalho)
            
            registros = []
            for row in reader:
                if len(row) >= 2: # Garante que a linha tem pelo menos código e termo
                    registros.append({
                        "codigoTabela": tabela,
                        "codigoTermo": row[0].strip(),
                        "termo": row[1].strip(),
                        "registroAnvisa": row[2].strip() if len(row) > 2 else None,
                        "ativo": True
                    })
            
            if not registros:
                self._send_response(400, {'sucesso': False, 'erro': 'O arquivo CSV está vazio ou inválido.'})
                return

            db.dominiotuss.delete_many(where={"codigoTabela": tabela})
            criados = db.dominiotuss.create_many(data=registros)
            self._send_response(200, {'sucesso': True, 'mensagem': f'Carga concluída! {criados} termos importados.'})
            
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': f"Erro: {str(e)}"})
        finally:
            if db.is_connected(): db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))
        
        