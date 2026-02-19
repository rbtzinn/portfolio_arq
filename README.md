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
