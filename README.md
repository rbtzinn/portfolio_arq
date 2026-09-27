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
Experiência imersiva em 3D, entrada separada do Vite (`jardim/index.html` → `src/jardim/`).
Nenhuma imagem: todas as peças (tijolos com pinos, placas curvas, barras, slopes) são geradas em código.

- `src/jardim/bricks/` geometria procedural, material ABS, montagem das flores, tiers de qualidade
- `src/jardim/scene/` cena R3F: câmera ligada ao scroll, flor-herói, jardim, buquê interativo
- `src/jardim/ui/` interface estilo manual de instruções
- `src/jardim/lib/` scroll (GSAP ScrollTrigger + Lenis), entrada (ponteiro/giroscópio/chacoalhar), áudio sintetizado

Parâmetros úteis: `/jardim/?q=low|mid|high` força a qualidade; `/jardim/?p=0.5` pula para um ponto da narrativa.
