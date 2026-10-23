import json
import csv
import io
from datetime import datetime
from http.server import BaseHTTPRequestHandler
from prisma import Prisma

def parse_data_flexivel(data_str):
    if not data_str or data_str == '-':
        return None
    try:
        return datetime.strptime(data_str, "%d/%m/%Y")
    except ValueError:
        try:
            return datetime.strptime(data_str, "%Y-%m-%d")
        except ValueError:
            return None

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

            reader = csv.DictReader(io.StringIO(csv_raw), delimiter=';')
            rows = list(reader)
            if not rows:
                self._send_response(400, {'sucesso': False, 'erro': 'Arquivo CSV vazio ou inválido.'})
                return

            source_arquivo = (rows[0].get('source') or '').strip()
            source_esperado = f"tuss-{tabela}"
            if source_arquivo != source_esperado:
                self._send_response(400, {'sucesso': False, 'erro': f'Layout Inválido! Você escolheu a Tabela {tabela}, mas o arquivo enviado pertence à tabela "{source_arquivo}".'})
                return

            existentes = db.dominiotuss.find_many(where={"codigoTabela": tabela})
            set_existentes = set()
            for e in existentes:
                d_ini = e.vigenciaInicio.strftime("%Y-%m-%d") if e.vigenciaInicio else "-"
                d_fim = e.vigenciaFim.strftime("%Y-%m-%d") if e.vigenciaFim else "-"
                if tabela in ['18', '22']:
                    set_existentes.add((e.codigoTermo, d_ini, d_fim))
                else: 
                    fab = getattr(e, 'fabricante', '') or ''
                    mod = getattr(e, 'apresentacaoModelo', '') or ''
                    set_existentes.add((e.codigoTermo, d_ini, d_fim, fab, mod))

            novos_registros = []
            for row in rows:
                # CORREÇÃO: Usa (row.get('x') or '') para impedir o erro NoneType
                cod = (row.get('id') or '').strip()
                if not cod: continue

                termo = (row.get('display_name') or '').strip()
                str_ini = (row.get('extras_inicio_vigencia') or '').strip()
                str_fim = (row.get('extras_fim_vigencia') or '').strip()
                
                dt_ini = parse_data_flexivel(str_ini)
                dt_fim = parse_data_flexivel(str_fim)
                
                comp_ini = dt_ini.strftime("%Y-%m-%d") if dt_ini else "-"
                comp_fim = dt_fim.strftime("%Y-%m-%d") if dt_fim else "-"

                fab, mod, anvisa, risco = '', '', None, None
                if tabela == '20':
                    fab = (row.get('extras_laboratorio') or '').strip()
                    mod = (row.get('extras_apresentacao') or '').strip()
                elif tabela == '19':
                    fab = (row.get('extras_fabricante') or '').strip()
                    mod = (row.get('extras_modelo') or '').strip()
                    anvisa = (row.get('extras_registro_anvisa') or '').strip()
                    risco = (row.get('extras_classe_risco') or '').strip()

                assinatura = (cod, comp_ini, comp_fim) if tabela in ['18', '22'] else (cod, comp_ini, comp_fim, fab, mod)
                if assinatura in set_existentes:
                    continue

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