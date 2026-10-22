import json
from http.server import BaseHTTPRequestHandler
from prisma import Prisma
from datetime import datetime, timezone

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        db = Prisma()
        try:
            db.connect()
            campanhas_ativas = db.campanhaads.find_many(where={"status": "ATIVO"})
            lista_anuncios = []
            agora = datetime.now(timezone.utc)

            for c in campanhas_ativas:
                if getattr(c, 'dataInicio', None) and c.dataInicio > agora: continue
                if getattr(c, 'dataFim', None) and c.dataFim < agora: continue
                
                # Resgata o local salvo ou assume cabeçalho como padrão
                local_banco = getattr(c, 'localExibicao', 'CABECALHO') or 'CABECALHO'
                
                lista_anuncios.append({
                    "titulo": c.empresa_nome,
                    "texto": c.tema,
                    "link": c.link_destino if c.link_destino else "modal",
                    "cor": "linear-gradient(-45deg, #10a37f, #0056b3)",
                    "local": local_banco
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
            if db.is_connected(): db.disconnect()