# Helena Costa Arquitetura — Botânica Modular

Portfólio em forma de experiência imersiva: peças de montar se encaixam no scroll, viram uma
flor, um jardim (cada canteiro é um projeto) e um buquê interativo.

## Rodar localmente
```bash
npm install
npm run dev
```

Variável opcional (Vercel → Settings → Environment Variables): `VITE_WHATSAPP_NUMBER` — ativa
"Iniciar um projeto" e "Conversar sobre este projeto" no WhatsApp. Projetos exibidos nos
canteiros: `src/data/projects.js`. Endereços antigos (`/jardim`, `/projetos/...`) redirecionam
para a raiz (`vercel.json`).

## Como funciona
Página única do Vite (`index.html` → `src/jardim/`).
Nenhuma imagem externa: todas as peças (tijolos com pinos, placas curvas, barras, slopes)
são geradas em código, renderizadas no Blender e servidas como sequências AVIF/WebP.

**Como funciona**
- Scroll 0 → 88%: sequência de frames pré-renderizada no Blender (Cycles), desenhada com
  WebGL (`src/jardim/seq/`): cada frame vira uma textura enviada à GPU uma vez; crossfade,
  lanterna e buquê são contas de shader (canvas 2D só como reserva). Carregamento progressivo (1 a cada 16 frames, depois 8,
  4, 2, 1), decodificação fora da thread principal e crossfade entre frames.
- Trecho escuro: a versão "iluminada" dos mesmos frames aparece por uma máscara que segue o
  cursor/giroscópio (lanterna).
- Final (buquê híbrido): parado ou girando, é um turntable de 120 ângulos renderizado no
  Blender (fundo transparente + sombra real), girado pelo arraste. Ao clicar, troca num
  instante pelas mesmas peças em Three.js, que explodem com física e remontam; depois volta
  ao render. Tudo composto sobre o último frame com a mesma câmera do Blender. O three.js
  só é baixado nesse trecho.
- Luz de estufa: uma treliça invisível à câmera projeta linhas de caixilho sobre o jardim.
- Entrada com portão "Entrar com som / sem som"; ambiência e cliques de encaixe sintetizados
  em WebAudio; títulos revelados linha a linha pelo scroll; cursor com inércia; háptica.

**Pipeline de assets** (`blender/`)
1. `npm run assets:export` — `export.mjs` usa a mesma geometria e lógica do site
   (`src/jardim/bricks/`) e grava malhas, matrizes por frame, câmeras e etiquetas.
2. `npm run assets:render` — `render.py` monta a cena no Blender em modo headless e
   renderiza desktop (1600×1000), retrato (720×1280), a versão "lanterna" e o turntable
   do buquê. Retomável (frames existentes são pulados).
   Precisa de um Python com `bpy` (`pip install bpy`) em `PY=...`, ou `PY="blender -b -P"`.
3. `npm run assets:encode` — `encode.py` converte com ffmpeg (AVIF 4:4:4 10 bits via
   libaom, com alfa como imagem auxiliar no turntable, + WebP de fallback) para
   `public/seq/` e gera `manifest.json`.

- `src/jardim/bricks/` geometria procedural, material ABS, flores, mundo (layout + poses + câmera)
- `src/jardim/scene/` buquê interativo em R3F
- `src/jardim/ui/` interface estilo manual de instruções
- `src/jardim/lib/` scroll (GSAP ScrollTrigger + Lenis), entrada, áudio sintetizado

`/jardim/?p=0.5` pula para um ponto da narrativa; `?fmt=webp` força o formato das imagens;
`?gate=0` pula o portão de som.

**Auditoria de layout** — `npm run test:layout [baseURL]` (com `npm run dev` ou `vite preview`
rodando): 8 viewports (1920×1080 até celular deitado) × 10 pontos da narrativa, procurando
overflow, texto cortado, sobreposição de blocos, contraste sobre o frame real e erros; mais
testes de girar o aparelho, falha de rede e foco por teclado. Screenshots em `tests/.shots/`.

**Desempenho** — `npm run test:perf [url] [cpu]` rola a página num celular emulado (DPR 3,
toque, CPU desacelerada) e mede quadros, tarefas longas e tempo de script/estilo/layout.
No celular: WebP (decodifica mais rápido), sem grão/desfoque de fundo, escritas de DOM só
quando algo muda e o 3D do buquê montado só perto do fim.
