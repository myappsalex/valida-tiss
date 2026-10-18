import json
import base64
import boto3
import os
import uuid
from http.server import BaseHTTPRequestHandler
from prisma import Prisma

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        db = Prisma()
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            dados = json.loads(post_data.decode('utf-8'))
            
            # Inicializar cliente R2
            s3 = boto3.client('s3',
                endpoint_url=f"https://{os.getenv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com",
                aws_access_key_id=os.getenv('R2_ACCESS_KEY_ID'),
                aws_secret_access_key=os.getenv('R2_SECRET_ACCESS_KEY')
            )
            
            # Processamento da Imagem Opcional
            url_banner = None
            if dados.get('arquivo_base64'):
                extensao = "png" if "image/png" in dados.get('arquivo_base64') else "jpg"
                imagem_bytes = base64.b64decode(dados['arquivo_base64'].split(',')[1])
                nome_ficheiro = f"banners/{uuid.uuid4().hex}.{extensao}"
                
                s3.put_object(
                    Bucket=os.getenv('R2_BUCKET_NAME'),
                    Key=nome_ficheiro,
                    Body=imagem_bytes,
                    ContentType=f"image/{extensao}"
                )
                url_banner = f"{os.getenv('R2_PUBLIC_URL')}/{nome_ficheiro}"

            # Aqui você conectaria ao Prisma para gravar na tabela CampanhaAds
            # db.connect()
            # db.campanhaads.create(data={"empresa": dados['empresa'], "tema": dados['tema'], "bannerUrl": url_banner, "status": "PENDENTE"})
            
            self._send_response(200, {'sucesso': True, 'mensagem': 'Pedido recebido com sucesso!', 'url': url_banner})
        except Exception as e:
            self._send_response(500, {'sucesso': False, 'erro': str(e)})

    def _send_response(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))