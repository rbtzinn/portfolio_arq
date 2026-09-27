# Helena Costa Arquitetura (React + Vite + Tailwind)

Projeto componentizado a partir do seu layout.

## Rodar localmente
```bash
npm install
npm run dev
```

## Estrutura
- `src/components/` componentes reutilizáveis (Navbar, Hero, etc.)
- `src/components/common/Reveal.jsx` animação fade-up no scroll
- `src/data/projects.js` dados do portfólio
- `src/styles/global.css` estilos globais (fonts, smooth scroll, animação ken-burns)

## Onde adicionar coisas novas (sugestões)
- Novas seções: crie um componente em `src/components/sections/` e importe em `App.jsx`
- Novos projetos: edite `src/data/projects.js`

## Botânica Modular (`/jardim/`)
Experiência imersiva, entrada separada do Vite (`jardim/index.html` → `src/jardim/`).
Nenhuma imagem externa: todas as peças (tijolos com pinos, placas curvas, barras, slopes)
são geradas em código, renderizadas no Blender e servidas como sequências AVIF/WebP.

**Como funciona**
- Scroll 0 → 88%: sequência de frames pré-renderizada no Blender (Cycles), desenhada num
  `<canvas>` 2D (`src/jardim/seq/`). Carregamento progressivo (1 a cada 16 frames, depois 8,
  4, 2, 1), decodificação fora da thread principal e crossfade entre frames.
- Trecho escuro: a versão "iluminada" dos mesmos frames aparece por uma máscara que segue o
  cursor/giroscópio (lanterna).
- Final: o buquê é Three.js em tempo real (explode/remonta, arrasta para girar), composto
  sobre o último frame com a mesma câmera do Blender; o pedestal do plate vira oclusor e o
  chão só recebe sombra. O three.js só é baixado nesse trecho.

**Pipeline de assets** (`blender/`)
1. `npm run assets:export` — `export.mjs` usa a mesma geometria e lógica do site
   (`src/jardim/bricks/`) e grava malhas, matrizes por frame, câmeras e etiquetas.
2. `npm run assets:render` — `render.py` monta a cena no Blender em modo headless e
   renderiza desktop (1280×800), mobile (540×960) e a versão "lanterna". Retomável.
   Precisa de um Python com `bpy` (`pip install bpy`) em `PY=...`, ou `PY="blender -b -P"`.
3. `npm run assets:encode` — `encode.py` converte com ffmpeg (AVIF 4:4:4 10 bits via
   libaom + WebP de fallback) para `public/seq/` e gera `manifest.json`.

- `src/jardim/bricks/` geometria procedural, material ABS, flores, mundo (layout + poses + câmera)
- `src/jardim/scene/` buquê interativo em R3F
- `src/jardim/ui/` interface estilo manual de instruções
- `src/jardim/lib/` scroll (GSAP ScrollTrigger + Lenis), entrada, áudio sintetizado

`/jardim/?p=0.5` pula para um ponto da narrativa.
