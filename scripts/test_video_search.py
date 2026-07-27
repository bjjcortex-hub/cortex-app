"""
Test: busca 3 vídeos (PT e EN) para 3 submissões.
"""

import time
import json
import yt_dlp

NODES = [
    {
        "name_pt": "Estrangulamento Triangular da Guarda Fechada",
        "name_en": "Triangle Choke from Closed Guard",
    },
    {
        "name_pt": "Kimura da Guarda",
        "name_en": "Kimura from Guard BJJ",
    },
    {
        "name_pt": "Estrangulamento em Loop da Guarda Fechada",
        "name_en": "Loop Choke from Closed Guard BJJ",
    },
]

N_VIDEOS = 3

YDL_OPTS = {
    "quiet": True,
    "no_warnings": True,
    "extract_flat": True,
    "skip_download": True,
}


def fmt_duration(secs) -> str:
    if not secs:
        return ""
    secs = int(secs)
    return f"{secs // 60}:{secs % 60:02d}"


def safe(text: str) -> str:
    return text.encode("ascii", "replace").decode("ascii")


def buscar(query: str, n: int = N_VIDEOS) -> list[dict]:
    try:
        with yt_dlp.YoutubeDL(YDL_OPTS) as ydl:
            result = ydl.extract_info(f"ytsearch{n}:{query}", download=False)
        videos = []
        for entry in (result.get("entries") or [])[:n]:
            secs = entry.get("duration")
            videos.append({
                "url": f"https://www.youtube.com/watch?v={entry['id']}",
                "title": entry.get("title", ""),
                "channel": entry.get("channel") or entry.get("uploader", ""),
                "duration": fmt_duration(secs),
                "thumbnail": entry.get("thumbnail", ""),
            })
        return videos
    except Exception as e:
        print(f"  ERRO: {e}")
        return []


def main():
    all_results = []

    for node in NODES:
        print(f"\n{'='*60}")
        print(f"  {node['name_pt']}")
        print(f"{'='*60}")

        # --- PT ---
        query_pt = f'"{node["name_pt"]}" jiu jitsu'
        print(f"\n[PT] query: {query_pt}")
        videos_pt = buscar(query_pt)
        for i, v in enumerate(videos_pt, 1):
            print(f"  {i}. {safe(v['title'])}")
            print(f"     {v['url']}  [{v['duration']}]  {safe(v['channel'])}")

        time.sleep(1.5)

        # --- EN ---
        query_en = f'"{node["name_en"]}" tutorial'
        print(f"\n[EN] query: {query_en}")
        videos_en = buscar(query_en)
        for i, v in enumerate(videos_en, 1):
            print(f"  {i}. {safe(v['title'])}")
            print(f"     {v['url']}  [{v['duration']}]  {safe(v['channel'])}")

        time.sleep(1.5)

        all_results.append({
            "name_pt": node["name_pt"],
            "name_en": node["name_en"],
            "videos_pt": videos_pt,
            "videos_en": videos_en,
        })

    # Salva resultado bruto para inspeção
    out = "D:/Programas/claude_code/bjj-explorer/scripts/test_video_results.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)
    print(f"\n\nResultados salvos em: {out}")


if __name__ == "__main__":
    main()
