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
            # 1. Recepção Segura do Payload
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            dados = json.loads(post_data.decode('utf-8'))
            
            tabela = dados.get('tabela')
            csv_raw = dados.get('csv_data')
            
            if not tabela or not csv_raw:
                self._send_response(400, {'sucesso': False, 'erro': 'Parâmetros inválidos (Tabela ou CSV ausentes).'})
                return

            # 2. Parseamento do CSV
            reader = csv.DictReader(io.StringIO(csv_raw), delimiter=';')
            rows = list(reader)
            if not rows:
                self._send_response(400, {'sucesso': False, 'erro': 'Arquivo CSV vazio ou corrompido.'})
                return

            # 3. Validação de Integridade do Layout (Prevenção de Lixo de Dados)
            source_arquivo = (rows[0].get('source') or '').strip()
            source_esperado = f"tuss-{tabela}"
            if source_arquivo != source_esperado:
                self._send_response(400, {'sucesso': False, 'erro': f'Inconsistência: Tabela selecionada "{tabela}", mas o arquivo é "{source_arquivo}".'})
                return

            # Extrai apenas os códigos presentes neste pacote (Delta Extraction)
            codigos_no_pacote = [ (r.get('id') or '').strip() for r in rows if (r.get('id') or '').strip() ]
            if not codigos_no_pacote:
                self._send_response(200, {'sucesso': True, 'mensagem': 'Nenhum código válido encontrado neste lote.'})
                return

            # 4. Conexão ao Banco e Mapeamento de Existentes (Carga Incremental)
            db.connect()
            
            existentes = db.dominiotuss.find_many(where={
                "codigoTabela": tabela,
                "codigoTermo": {"in": codigos_no_pacote}
            })
            
            # Construção de Hash Set para Lookup O(1)
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

            # 5. Processamento e Transformação
            novos_registros = []
            for row in rows:
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
                
                # Validação de Idempotência (Ignora se já existir)
                if assinatura in set_existentes:
                    continue
                
                # Adiciona ao Set local para evitar duplicidades dentro do próprio arquivo CSV
                set_existentes.add(assinatura)

                novo = {
                    "codigoTabela": tabela, 
                    "codigoTermo": cod, 
                    "termo": termo,
                    "vigenciaInicio": dt_ini, 
                    "vigenciaFim": dt_fim, 
                    "ativo": True
                }
                
                if tabela in ['19', '20']:
                    novo["fabricante"], novo["apresentacaoModelo"] = fab, mod
                if tabela == '19':
                    novo["registroAnvisa"], novo["classeRisco"] = anvisa, risco
                    
                novos_registros.append(novo)
            
            # 6. Gravação em Lote (Bulk Insert)
            if not novos_registros:
                self._send_response(200, {'sucesso': True, 'mensagem': 'Delta zero: Todos os termos deste lote já estão atualizados no banco.'})
                return

            criados = db.dominiotuss.create_many(data=novos_registros)
            self._send_response(200, {'sucesso': True, 'mensagem': f'Sucesso! {criados} novos registros salvos de forma incremental.'})
            
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': f"Erro interno do servidor: {str(e)}"})
        finally:
            if db.is_connected(): db.disconnect()

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))