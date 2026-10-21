import json
from http.server import BaseHTTPRequestHandler
from prisma_db import Prisma

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        db = Prisma()
        try:
            db.connect()
            # Busca todas as campanhas cujo status seja ATIVO
            campanhas_ativas = db.campanha.find_many(
                where={"status": "ATIVO"},
                include={"cliente": True} # Traz os dados da empresa dona da campanha
            )
            
            lista_anuncios = []
            for c in campanhas_ativas:
                # Transforma os dados do banco no formato que o nosso app.js espera
                lista_anuncios.append({
                    "titulo": c.cliente.nomeEmpresa,
                    "texto": "Clique aqui e saiba mais!",
                    "link": c.urlDestino if c.urlDestino else "modal",
                    "cor": "linear-gradient(-45deg, #10a37f, #0056b3)", # Cor dinâmica
                    "local": c.localBanner # "CABECALHO" ou "RODAPE"
                })
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(lista_anuncios).encode('utf-8'))
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'erro': str(e)}).encode('utf-8'))
        finally:
            if db.is_connected():
                db.disconnect()