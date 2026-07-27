"""
Popula o campo description de source_nodes usando o conteúdo dos flashcards no campo raw.
Estratégia:
  - Usa raw.name (EN) + raw.path como contexto
  - Usa a resposta do primeiro flashcard mais geral como corpo da descrição
  - Para nós sem flashcards: gera template mínimo com nome e path
"""

import json
import time
import requests

SUPABASE_URL = "https://rjrzhjbnexxmogjftvqa.supabase.co"
SERVICE_KEY  = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqcnpoamJuZXh4bW9namZ0dnFhIiwicm9sZSI6"
    "InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg3MzMwMSwiZXhwIjoyMTAwNDQ5MzAxfQ"
    ".vt2OHR0Oclw2S76FJRq-x44DGVlMXwyKCTpX-DMyW58"
)

HEADERS = {
    "apikey":        SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}

TYPE_LABEL = {
    "position":   "position",
    "transition": "technique",
    "submission": "submission",
}


def fetch_nodes(node_type: str) -> list[dict]:
    """Busca todos os nós do tipo, sem description."""
    url = f"{SUPABASE_URL}/rest/v1/source_nodes"
    params = {
        "select": "id,name,node_type,description,raw",
        "node_type": f"eq.{node_type}",
        "description": "is.null",
        "limit": 2000,
    }
    r = requests.get(url, headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def best_flashcard_answer(flashcards: list[dict]) -> str | None:
    """
    Retorna a resposta do flashcard mais adequado como descrição.
    Prefere respostas que não começam com pronome situacional
    ('Follow', 'Your opponent', 'This', 'If they' etc).
    """
    SKIP_STARTS = ("follow ", "your opponent", "this exposes", "this defense",
                   "if they", "immediately ", "stop fighting", "only attack",
                   "after partially", "as soon as", "take controlled")

    # primeira passagem: resposta que não seja situacional
    for fc in flashcards:
        a = fc.get("answer", "").strip()
        if a and not any(a.lower().startswith(s) for s in SKIP_STARTS):
            return a

    # fallback: primeira resposta disponível
    if flashcards:
        return flashcards[0].get("answer", "").strip() or None
    return None


def build_description(node: dict) -> str:
    raw  = node.get("raw") or {}
    name = raw.get("name") or node["name"]
    path = raw.get("path") or ""
    fc   = raw.get("flashcards") or []
    typ  = TYPE_LABEL.get(node["node_type"], node["node_type"])

    answer = best_flashcard_answer(fc)

    # Cabeçalho: "Name (Path)" ou só "Name"
    if path and path.strip("/") != name:
        header = f"{name} ({path})"
    else:
        header = name

    if answer:
        # Corta em frase completa dentro de ~450 chars
        body = answer[:450]
        last_period = body.rfind(".")
        if last_period > 150:
            body = body[: last_period + 1]
        return f"{header}. {body}"
    else:
        # Sem flashcard: template mínimo
        return f"{header}. BJJ {typ}."


def update_description(node_id: str, description: str) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/source_nodes?id=eq.{node_id}"
    r = requests.patch(url, headers=HEADERS, json={"description": description})
    return r.status_code in (200, 204)


def run():
    for node_type in ("position", "transition", "submission"):
        nodes = fetch_nodes(node_type)
        print(f"\n{node_type}: {len(nodes)} sem description")
        if not nodes:
            continue

        ok = 0
        fail = 0
        for i, node in enumerate(nodes):
            desc = build_description(node)
            if update_description(node["id"], desc):
                ok += 1
            else:
                fail += 1
                print(f"  FAIL: {node['name']}")
            # evita rate-limit
            if (i + 1) % 50 == 0:
                print(f"  {i+1}/{len(nodes)} processados...")
                time.sleep(0.3)

        print(f"  OK: {ok}  FAIL: {fail}")


if __name__ == "__main__":
    run()
