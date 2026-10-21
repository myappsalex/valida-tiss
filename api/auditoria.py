import json
from http.server import BaseHTTPRequestHandler
import os
import requests
from openai import OpenAI
from prisma_db import Prisma

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        db = Prisma()
        try:
            db.connect()
            
            # 1. Lê os dados enviados pelo JavaScript
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))

            numero_guia = data.get('guia', 'Desconhecida')
            itens = data.get('itens', [])
            provedor = data.get('provedor', 'gemini') 
            email_usuario = data.get('email', '') # Precisa enviar o e-mail no JS

            # 2. Verifica se o cliente tem saldo
            cliente = db.cliente.find_unique(where={"emailAcesso": email_usuario})

            if not cliente or cliente.tokensIA <= 0 or cliente.statusConta != "ATIVO":
                self._send_error(403, "Plano inativo ou sem tokens suficientes. Contacte o suporte.")
                return

            if not itens:
                self._send_error(400, "Nenhum item encontrado nesta guia para analisar.")
                return

            # 3. Monta a lista de itens cruzados
            resumo_itens = ""
            for item in itens:
                tipo = item.get('tipoDespesa', 'Procedimento')
                codigo = item.get('codigoItem', '')
                descricao = item.get('descricaoItem', '')
                qtd = item.get('qtdItem', '')
                valor = item.get('valorItem', '')
                
                if codigo != "-":
                    resumo_itens += f"- [{tipo}] Código: {codigo} | Descrição: {descricao} | Qtd: {qtd} | Valor: R$ {valor}\n"

            # 4. Engenharia de Prompt Otimizada
            prompt = f"""
                        Atue como auditor médico rigoroso (padrão TISS/TUSS).
                        Cruze o procedimento principal com os itens cobrados (materiais/taxas/medicamentos).
                        Regras:
                        - Aponte APENAS desvios técnicos, incompatibilidade de especialidade ou excessos abusivos.
                        - Se não houver desvio claro, retorne "Conta coerente".
                        - Não use saudações. Seja telegráfico.

                        Guia: {numero_guia}
                        Itens: {resumo_itens}

                        Responda ESTRITAMENTE neste formato JSON:
                        {{"status": "ALERTA" ou "OK", "achados": ["lista curta de desvios, se houver"]}}
            """
            resposta_ia = ""

            # 5. Roteamento de Modelos de IA (Gemini agora via API REST super leve)
            if provedor == 'gemini':
                api_key = os.environ.get("GEMINI_API_KEY")
                if not api_key: raise Exception("GEMINI_API_KEY não configurada.")
                
                url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
                payload = {"contents": [{"parts": [{"text": prompt}]}]}
                
                resp = requests.post(url, json=payload, headers={'Content-Type': 'application/json'})
                if resp.status_code == 200:
                    resposta_ia = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                else:
                    raise Exception(f"Erro na API do Gemini: {resp.text}")

            elif provedor == 'chatgpt':
                api_key = os.environ.get("OPENAI_API_KEY")
                if not api_key: raise Exception("OPENAI_API_KEY não configurada.")
                client = OpenAI(api_key=api_key)
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}]
                )
                resposta_ia = response.choices[0].message.content

            elif provedor == 'deepseek':
                api_key = os.environ.get("DEEPSEEK_API_KEY")
                if not api_key: raise Exception("DEEPSEEK_API_KEY não configurada.")
                client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
                response = client.chat.completions.create(
                    model="deepseek-chat",
                    messages=[{"role": "user", "content": prompt}]
                )
                resposta_ia = response.choices[0].message.content
            else:
                raise Exception("Provedor de IA desconhecido.")

            # 6. Deduz o token e grava o histórico
            db.cliente.update(
                where={"id": cliente.id},
                data={"tokensIA": {"decrement": 1}}
            )

            db.logia.create(
                data={
                    "clienteId": cliente.id,
                    "numeroGuia": numero_guia,
                    "motorUsado": provedor,
                    "tokensGastos": 1
                }
            )

            # 7. Devolve a resposta
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'analise': resposta_ia, 'provedor_usado': provedor}).encode('utf-8'))

        except Exception as e:
            self._send_error(500, f"Erro interno ao processar IA: {str(e)}")
            
        finally:
            if db.is_connected():
                db.disconnect()

    def _send_error(self, status, mensagem):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({'erro': mensagem}).encode('utf-8'))