#!/usr/bin/env bash
# Renderiza todas as sequências. PY = Python com o módulo bpy (pip install bpy) ou use
# PY="blender -b -P" com o Blender instalado. Frames já existentes são pulados (retomável).
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PY:-python}
N=${N:-360}
node blender/export.mjs "$N"
R="$PY blender/render.py --"
# buquê: turntable de 120 ângulos sobre fundo transparente (compositado no site)
$R --variant desktop --mode turn --frames 0:120:1 --res 1600x1000 --samples 12
# desktop: sequência completa (com motion blur) + versão "lanterna" do trecho escuro
$R --variant desktop --frames 0:$N:1 --res 1600x1000 --samples 12
$R --variant desktop --mode lit --frames 0:45:1 --res 1600x1000 --samples 12
# retrato: metade dos frames (o player interpola) + lanterna + turntable
$R --variant mobile --frames 0:$N:2 --res 720x1280 --samples 12
$R --variant mobile --frames $((N - 1)):$N:1 --res 720x1280 --samples 12
$R --variant mobile --mode lit --frames 0:45:2 --res 720x1280 --samples 12
$R --variant mobile --mode turn --frames 0:120:1 --res 720x1280 --samples 12
echo "RENDER_ALL_DONE"
