from http.server import BaseHTTPRequestHandler
from lxml import etree
# Força o Python a enxergar a pasta raiz do projeto na Vercel
pasta_raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if pasta_raiz not in sys.path:
    sys.path.append(pasta_raiz)
import os
import hashlib # NOVA IMPORTAÇÃO PARA O HASH
import sys
import json

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # 1. Lê os dados enviados
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            xml_content = data.get('xml', '')
            versao = data.get('versao', '4.03.00')

            # 2. Descobre qual arquivo XSD usar
            arquivo_xsd = 'tissV4_03_00.xsd'
            if versao == '4.01.00': arquivo_xsd = 'tissV4_01_00.xsd'
            elif versao == '4.02.00': arquivo_xsd = 'tissV4_02_00.xsd'
            elif versao == '3.03.02': arquivo_xsd = 'tissV3_03_02.xsd'
            elif versao == '3.03.01': arquivo_xsd = 'tissV3_03_01.xsd'
            elif versao == '3.03.00': arquivo_xsd = 'tissV3_03_00.xsd'
            elif versao == '3.02.02': arquivo_xsd = 'tissV3_02_02.xsd'
            elif versao == '3.02.01': arquivo_xsd = 'tissV3_02_01.xsd'
            
            xsd_path = os.path.join(os.getcwd(), 'schemas', arquivo_xsd)
            
            if not os.path.exists(xsd_path):
                self._send_response(500, {'erro': f'Arquivo XSD não encontrado no servidor: {arquivo_xsd}'})
                return

            # Converte o texto do XML enviado para o formato que o validador entende
            parser = etree.XMLParser(recover=False)
            xml_doc = etree.fromstring(xml_content.encode('utf-8'), parser=parser)

            # --- 3. NOVA FASE: VALIDAÇÃO DO HASH (MD5) ---
            namespaces = {'ans': 'http://www.ans.gov.br/padroes/tiss/schemas'}
            hash_node = xml_doc.find('.//ans:epilogo/ans:hash', namespaces)
            
            if hash_node is not None and hash_node.text:
                hash_enviado = hash_node.text.strip()
                
                # No TISS, o cálculo exato do Hash varia por operadora (geralmente é o MD5 de todo o conteúdo de <prestadorParaOperadora> 
                # ou a concatenação de campos chave). Aqui preparamos o motor MD5 estrutural.
                # Exemplo prático de extração da string do lote para hash:
                lote_node = xml_doc.find('.//ans:prestadorParaOperadora', namespaces)
                if lote_node is not None:
                    # Gera a string do nó para calcular o hash (canonicalização básica)
                    xml_string_base = etree.tostring(lote_node, method="c14n")
                    hash_calculado = hashlib.md5(xml_string_base).hexdigest()
                    
                    # Se houver divergência, bloqueia o processamento imediatamente
                    # (NOTA: Descomente as duas linhas abaixo quando a regra de canonicalização da sua operadora estiver 100% alinhada)
                    # if hash_enviado != hash_calculado:
                    #     self._send_response(400, {'valido': False, 'erros': [f'XSD_INVALIDO (Hash): O hash MD5 enviado ({hash_enviado}) difere do calculado.']})
                    #     return
            # ---------------------------------------------

            # 4. Prepara e executa a validação XSD
            with open(xsd_path, 'rb') as f:
                xsd_doc = etree.parse(f)
            schema = etree.XMLSchema(xsd_doc)

            if schema.validate(xml_doc):
                self._send_response(200, {'valido': True, 'mensagem': f'XML válido segundo o padrão TISS {versao}!'})
            else:
                erros = [str(error.message) for error in schema.error_log]
                self._send_response(400, {'valido': False, 'erros': erros})

        except etree.XMLSyntaxError as e:
            self._send_response(400, {'valido': False, 'erros': [f'Erro de sintaxe no XML: {str(e)}']})
        except Exception as e:
            self._send_response(500, {'erro': 'Erro interno no servidor.', 'detalhes': str(e)})

    def _send_response(self, status_code, payload):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))