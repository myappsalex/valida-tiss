import json
import csv
import io
from datetime import datetime
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

            # Utiliza o DictReader que mapeia a primeira linha como Chave automaticamente
            reader = csv.DictReader(io.StringIO(csv_raw), delimiter=';')
            rows = list(reader)
            if not rows:
                self._send_response(400, {'sucesso': False, 'erro': 'Arquivo CSV vazio ou inválido.'})
                return

            # 1. Validação de Segurança do Source
            source_arquivo = rows[0].get('source', '')
            source_esperado = f"tuss-{tabela}"
            if source_arquivo != source_esperado:
                self._send_response(400, {'sucesso': False, 'erro': f'Layout Inválido! Você escolheu a Tabela {tabela}, mas o arquivo enviado pertence à tabela "{source_arquivo}".'})
                return

            # 2. Mapeamento de Existentes para Bloquear Duplicidade
            existentes = db.dominiotuss.find_many(where={"codigoTabela": tabela})
            set_existentes = set()
            for e in existentes:
                d_ini = e.vigenciaInicio.strftime("%d/%m/%Y") if e.vigenciaInicio else "-"
                d_fim = e.vigenciaFim.strftime("%d/%m/%Y") if e.vigenciaFim else "-"
                if tabela in ['18', '22']:
                    set_existentes.add((e.codigoTermo, d_ini, d_fim))
                else: # 19, 20
                    fab = getattr(e, 'fabricante', '') or ''
                    mod = getattr(e, 'apresentacaoModelo', '') or ''
                    set_existentes.add((e.codigoTermo, d_ini, d_fim, fab, mod))

            novos_registros = []
            for row in rows:
                cod = row.get('id', '').strip()
                if not cod: continue

                termo = row.get('display_name', '').strip()
                str_ini = row.get('extras_inicio_vigencia', '').strip()
                str_fim = row.get('extras_fim_vigencia', '').strip()
                
                if str_ini == '-': str_ini = ''
                if str_fim == '-': str_fim = ''

                # Extração Específica por Tabela
                fab, mod, anvisa, risco = '', '', None, None
                if tabela == '20':
                    fab = row.get('extras_laboratorio', '').strip()
                    mod = row.get('extras_apresentacao', '').strip()
                elif tabela == '19':
                    fab = row.get('extras_fabricante', '').strip()
                    mod = row.get('extras_modelo', '').strip()
                    anvisa = row.get('extras_registro_anvisa', '').strip()
                    risco = row.get('extras_classe_risco', '').strip()

                # 3. Análise da Duplicidade pela Assinatura
                assinatura = (cod, str_ini or "-", str_fim or "-") if tabela in ['18', '22'] else (cod, str_ini or "-", str_fim or "-", fab, mod)
                if assinatura in set_existentes:
                    continue
                
                dt_ini = datetime.strptime(str_ini, "%d/%m/%Y") if str_ini else None
                dt_fim = datetime.strptime(str_fim, "%d/%m/%Y") if str_fim else None

                # Montagem do Registro
                novo = {
                    "codigoTabela": tabela, "codigoTermo": cod, "termo": termo,
                    "vigenciaInicio": dt_ini, "vigenciaFim": dt_fim, "ativo": True
                }
                if tabela in ['19', '20']:
                    novo["fabricante"], novo["apresentacaoModelo"] = fab, mod
                if tabela == '19':
                    novo["registroAnvisa"], novo["classeRisco"] = anvisa, risco
                    
                novos_registros.append(novo)
            
            if not novos_registros:
                self._send_response(200, {'sucesso': True, 'mensagem': 'Nenhum item importado. Todos os códigos com estas vigências já existem.'})
                return

            # 4. Inserção em Lotes
            criados = 0
            for i in range(0, len(novos_registros), 500):
                chunk = novos_registros[i:i + 500]
                db.dominiotuss.create_many(data=chunk)
                criados += len(chunk)
            
            self._send_response(200, {'sucesso': True, 'mensagem': f'Sucesso! {criados} novos termos importados para a Tabela {tabela}.'})
            
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': f"Erro: {str(e)}"})
        finally:
            if db.is_connected(): db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))