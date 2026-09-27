"""Converte os PNGs renderizados em sequências otimizadas para a web (ffmpeg).

  AVIF (libaom-av1, still picture)  → formato principal
  WebP (libwebp)                    → fallback
Saída: public/seq/<variante>/<modo>/NNNN.<ext> (numeração contígua) e public/seq/manifest.json
com os índices de frame de origem, dimensões, etiquetas e a câmera final do buquê.

Uso: python blender/encode.py [--jobs 4] [--ffmpeg ffmpeg]
"""
import argparse
import glob
import json
import os
import re
import shutil
import subprocess
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RENDERS = os.path.join(HERE, "renders")
OUT = os.path.join(ROOT, "public", "seq")

ap = argparse.ArgumentParser()
ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
ap.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "ffmpeg")
ap.add_argument("--crf", type=int, default=30)
ap.add_argument("--webp-q", type=int, default=72)
args = ap.parse_args()


def encode(src, dst_base):
    avif, webp = dst_base + ".avif", dst_base + ".webp"
    if not (os.path.exists(avif) and os.path.getmtime(avif) > os.path.getmtime(src)):
        subprocess.run(
            # 4:4:4 10 bits + tags BT.709/sRGB: sem manchas nos gradientes do estúdio e sem desvio de cor
            [args.ffmpeg, "-loglevel", "error", "-y", "-i", src,
             "-vf", "scale=out_color_matrix=bt709:out_range=full,format=yuv444p10le",
             "-c:v", "libaom-av1", "-still-picture", "1", "-crf", str(args.crf), "-cpu-used", "6",
             "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "iec61966-2-1", "-color_range", "pc",
             "-f", "avif", avif],
            check=True,
        )
    if not (os.path.exists(webp) and os.path.getmtime(webp) > os.path.getmtime(src)):
        subprocess.run(
            [args.ffmpeg, "-loglevel", "error", "-y", "-i", src, "-c:v", "libwebp", "-quality", str(args.webp_q),
             "-compression_level", "5", webp],
            check=True,
        )
    return os.path.getsize(avif), os.path.getsize(webp)


meta = json.load(open(os.path.join(HERE, "build", "meta.json")))
manifest = {k: meta[k] for k in ("frames", "seqEnd", "total", "built", "labels", "final", "bom")}
manifest["variants"] = {}
jobs = []
for variant in ("desktop", "mobile"):
    v = {}
    for mode in ("main", "lit"):
        files = sorted(glob.glob(os.path.join(RENDERS, f"{variant}_{mode}_*.png")))
        if not files:
            continue
        idx = [int(re.search(r"_(\d+)\.png$", f).group(1)) for f in files]
        d = os.path.join(OUT, variant, mode)
        os.makedirs(d, exist_ok=True)
        for i, f in enumerate(files):
            jobs.append((f, os.path.join(d, f"{i:04d}")))
        v[mode] = {"frames": idx, "path": f"{variant}/{mode}"}
    if v:
        from PIL import Image

        w, h = Image.open(glob.glob(os.path.join(RENDERS, f"{variant}_main_*.png"))[0]).size
        v["size"] = [w, h]
        manifest["variants"][variant] = v

with ThreadPoolExecutor(args.jobs) as ex:
    sizes = list(ex.map(lambda j: encode(*j), jobs))

# poster (noscript / Open Graph): a flor aberta
bloom = round(0.46 / meta["seqEnd"] * (meta["frames"] - 1))
src = os.path.join(RENDERS, f"desktop_main_{bloom:04d}.png")
if os.path.exists(src):
    subprocess.run([args.ffmpeg, "-loglevel", "error", "-y", "-i", src, "-c:v", "libwebp", "-quality", "80",
                    os.path.join(OUT, "poster.webp")], check=True)
    subprocess.run([args.ffmpeg, "-loglevel", "error", "-y", "-i", src, "-q:v", "3",
                    os.path.join(OUT, "poster.jpg")], check=True)

tot_a = sum(s[0] for s in sizes)
tot_w = sum(s[1] for s in sizes)
json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), separators=(",", ":"))
print(f"{len(jobs)} frames · AVIF {tot_a / 1e6:.1f} MB · WebP {tot_w / 1e6:.1f} MB")
