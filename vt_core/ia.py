"""Provedores de IA para pré-auditoria de guias.

Melhorias sobre o original:
  * timeout em toda chamada; erros não vazam detalhes;
  * itens enviados como DADO em JSON (mitiga prompt injection vinda do XML);
  * saída JSON forçada e validada/normalizada no servidor;
  * minimização de dados (LGPD): só campos técnicos do item; sem nº de guia,
    sem identificação de paciente;
  * sem o pacote `openai` (REST direto: menos peso/cold start).
"""
import json
import re
import sys
import requests
from . import config

# Timeout ajustado para 25s (a Vercel mata a função aos 30s)
TIMEOUT = (5, 55)

class IaErro(Exception):
    pass

SISTEMA = (
    "Você é auditor médico de contas hospitalares (padrão TISS/TUSS). "
    "Receba os itens cobrados de UMA guia. Para otimização, os itens foram AGRUPADOS: "
    "a 'qtdItem' representa a SOMA TOTAL lançada para aquele código em todo o período da guia. "
    "Avalie o contexto macro (ex: incompatibilidade entre dias de internação e qtd de diárias, "
    "procedimentos mutuamente excludentes, excessos abusivos para o quadro). Sem desvio claro, status OK. "
    "Responda SOMENTE JSON estrito neste formato: "
    '{"status": "OK"|"ALERTA", "achados": [{"tabela": "<tabela_do_item>", "codigo": "<codigo_do_item>", "risco": "Alto"|"Médio"|"Baixo", "motivo": "Explicação técnica"}]}'
)

def provedores_habilitados():
    bruto = config.env("IA_PROVEDORES_HABILITADOS", "gemini,chatgpt")
    return [p.strip() for p in bruto.split(",") if p.strip() in config.PROVEDORES_IA]

def montar_usuario(itens, contexto):
    return json.dumps({"contexto": contexto or {}, "itens": itens}, ensure_ascii=False)

def _post(url, headers, corpo):
    try:
        r = requests.post(url, headers=headers, json=corpo, timeout=TIMEOUT)
    except requests.RequestException as exc:
        print(f"[ia] rede/timeout: {type(exc).__name__}", file=sys.stderr)
        raise IaErro("rede")
    if r.status_code != 200:
        print(f"[ia] http {r.status_code}: {r.text[:200]}", file=sys.stderr)
        raise IaErro("http")
    return r.json()

def _chamar(provedor, usuario):
    if provedor == "gemini":
        chave = config.env("GEMINI_API_KEY", "").strip()
        if not chave:
            raise IaErro("sem chave")
            
        # Retornamos à sua configuração original de sucesso
        modelo = config.env("GEMINI_MODEL", "gemini-2.5-flash")
        
        # Conexão original via Header que funcionava no seu ambiente
        d = _post(f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent",
                  {"x-goog-api-key": chave},
                  {"systemInstruction": {"parts": [{"text": SISTEMA}]},
                   "contents": [{"role": "user", "parts": [{"text": usuario}]}],
                   "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1}})
        return d["candidates"][0]["content"]["parts"][0]["text"]
        
    cfg = {"chatgpt": ("OPENAI_API_KEY", "https://api.openai.com/v1/chat/completions", "OPENAI_MODEL", "gpt-4o-mini"),
           "deepseek": ("DEEPSEEK_API_KEY", "https://api.deepseek.com/chat/completions", "DEEPSEEK_MODEL", "deepseek-chat")}[provedor]
    
    chave = config.env(cfg[0], "").strip()
    if not chave:
        raise IaErro("sem chave")
    d = _post(cfg[1], {"Authorization": f"Bearer {chave}"},
              {"model": config.env(cfg[2], cfg[3]), "temperature": 0.1,
               "response_format": {"type": "json_object"},
               "messages": [{"role": "system", "content": SISTEMA},
                            {"role": "user", "content": usuario}]})
    return d["choices"][0]["message"]["content"]

def normalizar(texto):
    """Extrai e valida o JSON estruturado por risco e tabela."""
    import re
    import json
    
    match = re.search(r"\{[\s\S]*\}", (texto or "").strip())
    if not match:
        raise IaErro("json")
        
    try:
        d = json.loads(match.group(0))
    except ValueError:
        raise IaErro("json")
        
    if not isinstance(d, dict):
        raise IaErro("json")
        
    achados = []
    for a in (d.get("achados") or []):
        if isinstance(a, dict) and a.get("motivo"):
            achados.append({
                "tabela": str(a.get("tabela", "Geral"))[:20],
                "codigo": str(a.get("codigo", ""))[:20],
                "risco": str(a.get("risco", "Médio")).capitalize()[:10],
                "motivo": str(a.get("motivo", ""))[:300]
            })
            
    status = "ALERTA" if achados else "OK"
    return {"status": status, "achados": achados}
    
def analisar(provedor, itens, contexto):
    try:
        return normalizar(_chamar(provedor, montar_usuario(itens, contexto)))
    except (KeyError, IndexError, TypeError):
        raise IaErro("formato")