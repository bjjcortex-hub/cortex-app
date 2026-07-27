"""
Popula source_node_videos com links do YouTube (sem API oficial).
Busca por nome PT e EN. Tem checkpoint para retomar se interrompido.

Uso:
  python scripts/populate_videos.py              # todos os nós
  python scripts/populate_videos.py --test       # apenas os 3 nós de teste
"""

import sys
import time
import json
import requests
import yt_dlp

SUPABASE_URL = "https://rjrzhjbnexxmogjftvqa.supabase.co"
SERVICE_KEY  = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqcnpoamJuZXh4bW9namZ0dnFhIiwicm9sZSI6"
    "InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg3MzMwMSwiZXhwIjoyMTAwNDQ5MzAxfQ"
    ".vt2OHR0Oclw2S76FJRq-x44DGVlMXwyKCTpX-DMyW58"
)
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

TEST_NAMES = [
    "Estrangulamento Triangular da Guarda Fechada",
    "Kimura da Guarda",
    "Estrangulamento em Loop da Guarda Fechada",
]

# Tradução manual das 3 de teste; para os demais usamos o nome em inglês via campo name_en (futuro)
EN_OVERRIDES: dict[str, str] = {
    "Estrangulamento Triangular da Guarda Fechada": "Triangle Choke from Closed Guard BJJ tutorial",
    "Kimura da Guarda": "Kimura from Guard BJJ tutorial",
    "Estrangulamento em Loop da Guarda Fechada": "Loop Choke from Closed Guard BJJ tutorial",
}

N_VIDEOS   = 3
DELAY      = 2.0    # segundos entre buscas
PAGE       = 1000
CHECKPOINT = "scripts/populate_videos_checkpoint.json"

YDL_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "extract_flat": True,
    "skip_download": True,
}


# ── Supabase helpers ──────────────────────────────────────────────────────────

def sb_get(path: str, params: dict = {}) -> list:
    rows, offset = [], 0
    while True:
        p = {**params, "offset": offset, "limit": PAGE}
        r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, params=p)
        r.raise_for_status()
        batch = r.json()
        rows += batch
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def sb_insert(path: str, rows: list[dict]) -> None:
    if not rows:
        return
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{path}", headers=HEADERS, json=rows)
    r.raise_for_status()


def sb_delete_node_videos(node_id: str) -> None:
    r = requests.delete(
        f"{SUPABASE_URL}/rest/v1/source_node_videos",
        headers=HEADERS,
        params={"node_id": f"eq.{node_id}"},
    )
    r.raise_for_status()


# ── YouTube search ────────────────────────────────────────────────────────────

def fmt_duration(secs) -> str:
    if not secs:
        return ""
    secs = int(secs)
    return f"{secs // 60}:{secs % 60:02d}"


def youtube_search(query: str, n: int = N_VIDEOS) -> list[dict]:
    try:
        with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
            result = ydl.extract_info(f"ytsearch{n}:{query}", download=False)
        videos = []
        for entry in (result.get("entries") or [])[:n]:
            videos.append({
                "url":      f"https://www.youtube.com/watch?v={entry['id']}",
                "title":    entry.get("title", ""),
                "channel":  entry.get("channel") or entry.get("uploader", ""),
                "duration": fmt_duration(entry.get("duration")),
                "thumbnail": entry.get("thumbnail", ""),
            })
        return videos
    except Exception as e:
        print(f"    yt-dlp erro: {e}")
        return []


def search_with_fallback(query_strict: str, query_loose: str, n: int = N_VIDEOS) -> list[dict]:
    results = youtube_search(query_strict, n)
    if len(results) < 2:
        results = youtube_search(query_loose, n)
    return results


# ── Checkpoint ────────────────────────────────────────────────────────────────

def load_checkpoint() -> set[str]:
    try:
        with open(CHECKPOINT, encoding="utf-8") as f:
            return set(json.load(f))
    except FileNotFoundError:
        return set()


def save_checkpoint(done: set[str]) -> None:
    with open(CHECKPOINT, "w", encoding="utf-8") as f:
        json.dump(list(done), f)


# ── Main ──────────────────────────────────────────────────────────────────────

def build_pt_query(name: str) -> tuple[str, str]:
    strict = f'"{name}" jiu jitsu'
    loose  = f"{name} jiu jitsu"
    return strict, loose


def build_en_query(name: str, node_type: str, en_override: str | None) -> tuple[str, str]:
    if en_override:
        return en_override, en_override
    suffix = "BJJ tutorial" if node_type in ("transition", "submission") else "BJJ position"
    strict = f'"{name}" {suffix}'
    loose  = f"{name} {suffix}"
    return strict, loose


def process_node(node: dict, done: set[str]) -> None:
    node_id   = node["id"]
    name      = node["name"]
    node_type = node["node_type"]

    if node_id in done:
        print(f"  skip (já feito)")
        return

    en_override = EN_OVERRIDES.get(name)

    # PT
    pt_strict, pt_loose = build_pt_query(name)
    videos_pt = search_with_fallback(pt_strict, pt_loose)
    time.sleep(DELAY)

    # EN
    en_strict, en_loose = build_en_query(name, node_type, en_override)
    videos_en = search_with_fallback(en_strict, en_loose)
    time.sleep(DELAY)

    rows: list[dict] = []
    for rank, v in enumerate(videos_pt):
        rows.append({**v, "node_id": node_id, "lang": "pt", "rank": rank})
    for rank, v in enumerate(videos_en):
        rows.append({**v, "node_id": node_id, "lang": "en", "rank": rank})

    if rows:
        sb_delete_node_videos(node_id)  # limpa antes de reinserir (idempotente)
        sb_insert("source_node_videos", rows)

    total = len(videos_pt) + len(videos_en)
    print(f"  {len(videos_pt)} PT + {len(videos_en)} EN = {total} vídeos inseridos")

    done.add(node_id)
    save_checkpoint(done)


def main() -> None:
    test_mode = "--test" in sys.argv

    print("Buscando nós no banco...")
    source_id_rows = sb_get("sources", {"key": "eq.bjjgraph", "select": "id"})
    if not source_id_rows:
        print("ERRO: source bjjgraph não encontrado")
        sys.exit(1)
    source_id = source_id_rows[0]["id"]

    nodes = sb_get(
        "source_nodes",
        {"source_id": f"eq.{source_id}", "select": "id,name,node_type"},
    )
    print(f"{len(nodes)} nós encontrados")

    if test_mode:
        nodes = [n for n in nodes if n["name"] in TEST_NAMES]
        print(f"Modo teste: {len(nodes)} nós selecionados")

    done = load_checkpoint()
    print(f"{len(done)} nós já processados (checkpoint)\n")

    for i, node in enumerate(nodes, 1):
        name = node["name"]
        print(f"[{i}/{len(nodes)}] {name}")
        process_node(node, done)

    print(f"\nConcluído. {len(done)} nós processados.")


if __name__ == "__main__":
    main()
