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

            # Lê o CSV considerando o ponto e vírgula como separador padrão no Brasil
            reader = csv.DictReader(io.StringIO(csv_raw), delimiter=';')
            registros = []
            
            for row in reader:
                registros.append({
                    "codigoTabela": tabela,
                    "codigoTermo": row.get('codigoTermo', '').strip(),
                    "termo": row.get('termo', '').strip(),
                    "registroAnvisa": row.get('registroAnvisa', '').strip() or None,
                    "ativo": True
                })
            
            if not registros:
                self._send_response(400, {'sucesso': False, 'erro': 'O arquivo CSV está vazio ou com cabeçalhos inválidos.'})
                return

            # Limpa os dados antigos desta tabela específica antes de inserir os novos (Atualização Full)
            db.dominio_tuss.delete_many(where={"codigoTabela": tabela})
            criados = db.dominio_tuss.create_many(data=registros)
            
            self._send_response(200, {'sucesso': True, 'mensagem': f'Carga concluída! {criados.count} termos atualizados na Tabela {tabela}.'})
            
        except Exception as e:
            # Captura todas as propriedades que o Prisma reconhece e devolve no erro
            tabelas_disponiveis = [a for a in dir(db) if not a.startswith('_')]
            self._send_response(500, {
                'sucesso': False, 
                'erro': f"Erro: {str(e)}", 
                'tabelas_encontradas': tabelas_disponiveis
            })
        finally:
            if db.is_connected(): db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))
        
        