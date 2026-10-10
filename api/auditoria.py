import json
from http.server import BaseHTTPRequestHandler
import os
import google.generativeai as genai
from openai import OpenAI

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # 1. Lê os dados enviados pelo JavaScript
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            numero_guia = data.get('guia', 'Desconhecida')
            itens = data.get('itens', [])
            provedor = data.get('provedor', 'gemini') # Identifica qual IA foi chamada

            if not itens:
                self._send_error(400, "Nenhum item encontrado nesta guia para analisar.")
                return

            # 2. Monta a lista de itens cruzados
            resumo_itens = ""
            for item in itens:
                tipo = item.get('tipoDespesa', 'Procedimento')
                codigo = item.get('codigoItem', '')
                descricao = item.get('descricaoItem', '')
                qtd = item.get('qtdItem', '')
                valor = item.get('valorItem', '')
                
                if codigo != "-":
                    resumo_itens += f"- [{tipo}] Código: {codigo} | Descrição: {descricao} | Qtd: {qtd} | Valor: R$ {valor}\n"

            # 3. Engenharia de Prompt
            prompt = f"""
            Você é um médico auditor sênior, especialista em faturamento hospitalar, contas médicas e padrão TISS/TUSS no Brasil.
            Sua tarefa é analisar a pertinência e compatibilidade entre os procedimentos executados e os materiais, medicamentos e taxas cobrados na conta abaixo.
            
            Identifique:
            1. Possíveis excessos de quantidade.
            2. Cobranças indevidas ou itens incompatíveis com a especialidade do procedimento principal.
            3. Taxas ou diárias que não fazem sentido.

            Guia Número: {numero_guia}
            Itens Cobrados:
            {resumo_itens}

            Aja de forma direta e técnica. Gere um relatório curto apontando exclusivamente os alertas de auditoria. Se a conta parecer perfeitamente coerente e enxuta, informe que não há indícios de anomalias. Não cite nomes de pacientes.
            """

            resposta_ia = ""

            # 4. Roteamento de Modelos de IA
            if provedor == 'gemini':
                api_key = os.environ.get("GEMINI_API_KEY")
                if not api_key: raise Exception("GEMINI_API_KEY não configurada.")
                genai.configure(api_key=api_key)
                ##model = genai.GenerativeModel('gemini-1.5-flash')
                model = genai.GenerativeModel('gemini-2.5-flash')
                response = model.generate_content(prompt)
                resposta_ia = response.text

            elif provedor == 'chatgpt':
                api_key = os.environ.get("OPENAI_API_KEY")
                if not api_key: raise Exception("OPENAI_API_KEY não configurada.")
                client = OpenAI(api_key=api_key)
                response = client.chat.completions.create(
                    model="gpt-4o-mini", # Usando o modelo rápido e barato da OpenAI
                    messages=[{"role": "user", "content": prompt}]
                )
                resposta_ia = response.choices[0].message.content

            elif provedor == 'deepseek':
                api_key = os.environ.get("DEEPSEEK_API_KEY")
                if not api_key: raise Exception("DEEPSEEK_API_KEY não configurada.")
                # DeepSeek usa a mesma biblioteca da OpenAI, apenas mudamos a Base URL
                #client = OpenAI(api_key=api_key, base_url="https://api.chat.deepseek.com/v1")
                client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
                response = client.chat.completions.create(
                    model="deepseek-chat",
                    messages=[{"role": "user", "content": prompt}]
                )
                resposta_ia = response.choices[0].message.content
            
            else:
                raise Exception("Provedor de IA desconhecido.")

            # 5. Devolve a resposta
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'analise': resposta_ia, 'provedor_usado': provedor}).encode('utf-8'))

        except Exception as e:
            self._send_error(500, f"Erro interno ao processar IA: {str(e)}")

    def _send_error(self, status, mensagem):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'erro': mensagem}).encode('utf-8'))