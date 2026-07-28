"""
Migração: torna "Posição em Pé" standalone e cria Training Roll.

Passos para standing-position:
  1. Busca todas as arestas de /top e /bottom (com dst_raw_name correto)
  2. Para cada aresta:
     - src ou dst remapeado de filho → pai
     - Se era entrada (dst = filho): dst_raw_name atualizado para nome do pai
     - Se era saída (src = filho): dst_raw_name mantido (aponta para o destino)
     - role zerado (top/bottom não faz sentido no pai)
  3. Deduplicação por (src, dst_raw_name, edge_type, role=null, result_type)
  4. Deleta arestas dos filhos
  5. Deleta nós filhos

Passos para Training Roll:
  - Cria o nó standalone se não existir
"""

import requests
import json

SUPABASE_URL = "https://rjrzhjbnexxmogjftvqa.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqcnpoamJuZXh4bW9namZ0dnFhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg3MzMwMSwiZXhwIjoyMTAwNDQ5MzAxfQ.vt2OHR0Oclw2S76FJRq-x44DGVlMXwyKCTpX-DMyW58"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

PARENT_ID   = "e54b959c-ccf6-433a-9886-d5780c384e36"  # standing-position
PARENT_NAME = "Posição em Pé"
TOP_ID      = "3f3ea02d-c87e-486a-a336-ff3c99da7596"  # standing-position/top
BOTTOM_ID   = "088e6d16-985f-4594-bdcc-20fcf72755d9"  # standing-position/bottom
CHILD_IDS   = {TOP_ID, BOTTOM_ID}

def get(table, params=""):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=HEADERS)
    r.raise_for_status()
    return r.json()

def post(table, body):
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=HEADERS, json=body)
    if not r.ok:
        print(f"  POST error {r.status_code}: {r.text[:200]}")
        print(f"  Body: {json.dumps(body)[:200]}")
        r.raise_for_status()
    return r.json()

def delete(table, params):
    r = requests.delete(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=HEADERS)
    r.raise_for_status()

# ── 1. source_id ──────────────────────────────────────────────────────────────

sources = get("sources", "key=eq.bjjgraph&select=id")
source_id = sources[0]["id"]
print(f"source_id: {source_id}")

# ── 2. Arestas existentes no pai (para deduplicação) ──────────────────────────

existing_raw = get("source_edges",
    f"or=(src_node_id.eq.{PARENT_ID},dst_node_id.eq.{PARENT_ID})"
    "&select=src_node_id,dst_node_id,dst_raw_name,edge_type,role,result_type")

# Chave única igual ao constraint do banco
def edge_key(src, dst_raw_name, edge_type, role, result_type):
    return (src, dst_raw_name, edge_type, role, result_type)

existing_keys = set()
for e in existing_raw:
    key = edge_key(e["src_node_id"], e["dst_raw_name"], e["edge_type"], e["role"], e["result_type"])
    existing_keys.add(key)

print(f"Arestas já no pai: {len(existing_keys)}")

# ── 3. Arestas dos filhos (com select=* para incluir dst_raw_name) ────────────

child_edges = []
for child_id in [TOP_ID, BOTTOM_ID]:
    edges = get("source_edges",
        f"or=(src_node_id.eq.{child_id},dst_node_id.eq.{child_id})"
        "&select=*")
    child_edges.extend(edges)

print(f"Arestas totais dos filhos: {len(child_edges)}")

# ── 4. Recriar arestas no pai ──────────────────────────────────────────────────

created = 0
skipped_dup = 0
skipped_selfloop = 0

for e in child_edges:
    src = e["src_node_id"]
    dst = e["dst_node_id"]
    dst_raw_name = e["dst_raw_name"]

    is_src_child = src in CHILD_IDS
    is_dst_child = dst in CHILD_IDS

    # Remap
    new_src = PARENT_ID if is_src_child else src
    new_dst = PARENT_ID if is_dst_child else dst

    # Self-loop após remap
    if new_src == new_dst:
        skipped_selfloop += 1
        continue

    # Se o destino era o filho, atualizar dst_raw_name para o nome do pai
    if is_dst_child:
        dst_raw_name = PARENT_NAME

    key = edge_key(new_src, dst_raw_name, e["edge_type"], None, e["result_type"])
    if key in existing_keys:
        skipped_dup += 1
        continue

    body = {
        "source_id":    source_id,
        "src_node_id":  new_src,
        "dst_node_id":  new_dst,
        "dst_raw_name": dst_raw_name,
        "edge_type":    e["edge_type"],
        "result_type":  e["result_type"],
        "is_submission": e["is_submission"],
        "attempt_pct":  e["attempt_pct"],
        "success_rate": e["success_rate"],
        "label":        e["label"],
        "role":         None,  # top/bottom não faz sentido no pai standalone
    }
    post("source_edges", body)
    existing_keys.add(key)
    created += 1
    if created % 10 == 0:
        print(f"  ... {created} arestas criadas")

print(f"Arestas criadas no pai:    {created}")
print(f"  Duplicatas ignoradas:    {skipped_dup}")
print(f"  Self-loops ignorados:    {skipped_selfloop}")

# ── 5. Deletar arestas dos filhos ─────────────────────────────────────────────

for child_id in [TOP_ID, BOTTOM_ID]:
    delete("source_edges", f"src_node_id=eq.{child_id}")
    delete("source_edges", f"dst_node_id=eq.{child_id}")
    print(f"Arestas de {child_id[:8]}... deletadas")

# ── 6. Deletar nós filhos ─────────────────────────────────────────────────────

delete("source_nodes", f"id=eq.{TOP_ID}")
delete("source_nodes", f"id=eq.{BOTTOM_ID}")
print("Nós /top e /bottom deletados")

# ── 7. Criar Training Roll ────────────────────────────────────────────────────

existing_tr = get("source_nodes", "external_id=eq.training-roll&select=id,name")
if existing_tr:
    print(f"Training Roll já existe: {existing_tr[0]}")
else:
    tr = post("source_nodes", {
        "source_id":          source_id,
        "external_id":        "training-roll",
        "name":               "Rola de Treino",
        "node_type":          "position",
        "parent_external_id": None,
        "raw":                {"name": "Training Roll"},
        "description":        "Ponto de partida neutro — posição standalone sem variantes.",
    })
    print(f"Training Roll criado: {tr[0]['id'] if isinstance(tr, list) else tr.get('id','?')}")

print("\n✓ Migração concluída.")
