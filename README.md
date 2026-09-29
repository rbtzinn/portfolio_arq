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
Página única do Vite (`index.html` → `src/jardim/`). Nenhuma imagem externa: todas as peças
(tijolos com pinos, placas curvas, barras, slopes) são geradas em código.

**3D em tempo real** (`src/jardim/scene/`)
- A cena inteira é desenhada ao vivo com Three.js a partir da posição do scroll, com a
  coreografia de `src/jardim/bricks/world.js` (poses de cada peça + trilha da câmera). O
  movimento é contínuo (60/120 Hz): não há quadros pré-renderizados nem vídeo.
- `Engine.js`: um `InstancedMesh` por tipo de peça em cada mundo (flor, jardim, buquê) —
  poucas dezenas de chamadas de desenho para ~5.400 peças; geometria mais simples no jardim;
  plástico em `MeshStandardMaterial` com reflexos de estúdio pré-calculados (PMREM); uma luz
  com sombra que acompanha o foco da câmera; resolução limitada no celular.
- `Scene3D.jsx`: suaviza scroll e ponteiro, desenha só quando algo muda e o hero não cobre a
  tela, projeta as etiquetas dos projetos com a câmera ao vivo, contador de peças e sons.
- Trecho escuro: a lanterna é uma luz de verdade que segue o cursor/giroscópio; a luz da
  estufa acende na transição.
- `BouquetRig.js`: buquê final — monta na chegada, gira com arraste/inércia, explode com
  física ao clicar/chacoalhar e remonta peça por peça.
- Hero com imagem da flor (render do Blender); textos dos tópicos entram por transição CSS
  depois de cada montagem completa; ambiência e cliques de encaixe sintetizados em WebAudio.
- `/flor`: protótipo isolado só da flor (`flor.html`, `src/flor/`).

**Blender** (`blender/`): gera as imagens do hero e do poster. `export.mjs` usa a mesma
geometria e lógica do site e grava malhas/matrizes; `render.py` renderiza no Blender em modo
headless (precisa de `bpy`); `encode.py` converte com ffmpeg para `public/seq/`.

- `src/jardim/bricks/` geometria procedural, cores, flores, mundo (layout + poses + câmera)
- `src/jardim/scene/` motor 3D em tempo real
- `src/jardim/ui/` interface estilo manual de instruções
- `src/jardim/lib/` scroll (GSAP ScrollTrigger + Lenis), entrada, áudio sintetizado

`/?p=0.5` pula para um ponto da narrativa; `?debug=1` mostra quadros/s e chamadas de desenho.

**Auditoria de layout** — `npm run test:layout [baseURL]` (com `npm run dev` ou `vite preview`
rodando): 8 viewports (1920×1080 até celular deitado) × 13 pontos da narrativa, procurando
overflow, texto cortado, sobreposição de blocos, contraste sobre a cena real e erros; mais
testes de girar o aparelho, navegador sem WebGL e foco por teclado. Screenshots em `tests/.shots/`.

**Desempenho** — `npm run test:perf [url] [cpu]` rola a página num celular emulado (DPR 3,
toque, CPU desacelerada) e mede quadros, tarefas longas e tempo de script/estilo/layout.
`RANGE=a,b` mede só um trecho da experiência.
