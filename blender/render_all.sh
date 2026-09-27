#!/usr/bin/env bash
# Renderiza todas as sequências. PY = Python com o módulo bpy (pip install bpy) ou use
# PY="blender -b -P" com o Blender instalado. Frames já existentes são pulados (retomável).
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PY:-python}
N=${N:-240}
node blender/export.mjs "$N"
R="$PY blender/render.py --"
# desktop: sequência completa + versão "lanterna" do trecho escuro
$R --variant desktop --frames 0:$N:1 --res 1280x800 --samples 12
$R --variant desktop --mode lit --frames 0:31:1 --res 1280x800 --samples 12
# mobile (retrato): metade dos frames, o player interpola
$R --variant mobile --frames 0:$N:2 --res 540x960 --samples 12
$R --variant mobile --frames $((N - 1)):$N:1 --res 540x960 --samples 12
$R --variant mobile --mode lit --frames 0:31:2 --res 540x960 --samples 12
