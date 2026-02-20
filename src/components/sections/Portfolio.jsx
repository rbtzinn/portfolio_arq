import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import Reveal from '../common/Reveal.jsx';
import ProjectCard from '../portfolio/ProjectCard.jsx';
import ProjectModal from '../portfolio/ProjectModal.jsx';
import ProjectCardSkeleton from '../portfolio/ProjectCardSkeleton.jsx';
import { useProjects } from '../../hooks/useProjects.js';

function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-xs tracking-widest uppercase border transition-colors ${
        active
          ? 'bg-stone-900 text-white border-stone-900'
          : 'bg-white text-stone-700 border-stone-200 hover:border-stone-900'
      }`}
    >
      {children}
    </button>
  );
}

export default function Portfolio() {
  const { projects, loading } = useProjects();
  const [selected, setSelected] = useState(null);
  const [activeCat, setActiveCat] = useState('Todos');

  // Novos estados para controlar a visibilidade das setas
  const [isAtStart, setIsAtStart] = useState(true);
  const [isAtEnd, setIsAtEnd] = useState(false);

  const scrollerRef = useRef(null);

  const categories = useMemo(() => {
    const cats = Array.from(new Set((projects || []).map((p) => p.category).filter(Boolean)));
    return ['Todos', ...cats];
  }, [projects]);

  const filtered = useMemo(() => {
    if (activeCat === 'Todos') return projects || [];
    return (projects || []).filter((p) => p.category === activeCat);
  }, [projects, activeCat]);

  const useCarousel = !loading && filtered.length > 5;

  // Função que verifica a posição do scroll
  const handleScroll = () => {
    if (!scrollerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollerRef.current;
    
    setIsAtStart(scrollLeft <= 0);
    // Usamos -1 para evitar bugs de arredondamento de pixels em algumas telas
    setIsAtEnd(scrollLeft + clientWidth >= scrollWidth - 1);
  };

  // Atualiza as setas quando a lista de projetos muda ou a janela redimensiona
  useEffect(() => {
    handleScroll();
    window.addEventListener('resize', handleScroll);
    return () => window.removeEventListener('resize', handleScroll);
  }, [filtered, loading]);

  const scrollByAmount = (dir = 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.round(el.clientWidth * 0.9) * dir;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  return (
    <section id="projetos" className="py-24 md:py-32 bg-stone-50">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="text-center mb-10">
          <Reveal>
            <h2 className="text-sm tracking-widest uppercase text-stone-500 mb-4">Portfólio</h2>
          </Reveal>
          <Reveal delay="100ms">
            <h3 className="text-4xl md:text-5xl font-light text-stone-900">Projetos Selecionados</h3>
          </Reveal>
        </div>

        {/* filtros */}
        {!loading && categories.length > 1 && (
          <Reveal className="flex flex-wrap justify-center gap-2 mb-10">
            {categories.map((c) => (
              <FilterButton key={c} active={activeCat === c} onClick={() => setActiveCat(c)}>
                {c}
              </FilterButton>
            ))}
          </Reveal>
        )}

        {/* LOADING -> skeleton */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        ) : useCarousel ? (
          <div className="relative group/carousel">
            
            {/* Seta Esquerda (Esconde se estiver no começo) */}
            <button
              type="button"
              onClick={() => scrollByAmount(-1)}
              // A classe condicional verifica se isAtStart é true. Se for, aplica opacity-0 e pointer-events-none
              className={`hidden md:flex items-center justify-center absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white shadow-md border border-stone-200 text-stone-800 transition-all hover:bg-stone-50 duration-300 ${
                isAtStart ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              aria-label="Voltar"
            >
              <ChevronLeft size={22} strokeWidth={1.5} />
            </button>

            {/* Seta Direita (Esconde se estiver no final) */}
            <button
              type="button"
              onClick={() => scrollByAmount(1)}
              className={`hidden md:flex items-center justify-center absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white shadow-md border border-stone-200 text-stone-800 transition-all hover:bg-stone-50 duration-300 ${
                isAtEnd ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}
              aria-label="Avançar"
            >
              <ChevronRight size={22} strokeWidth={1.5} />
            </button>

            <div
              ref={scrollerRef}
              onScroll={handleScroll} // <--- Monitora a rolagem aqui
              className="flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 -mx-2 px-2 md:px-0 md:mx-0 no-scrollbar"
            >
              {filtered.map((project, i) => (
                <div
                  key={project.id || i}
                  className="snap-start shrink-0 w-full md:w-[calc(33.333%-1rem)] lg:w-[calc(20%-1.2rem)]"
                >
                  <Reveal delay={`${(i % 5) * 120}ms`}>
                    <button
                      type="button"
                      className="w-full text-left outline-none focus:ring-2 focus:ring-stone-400 rounded-sm"
                      onClick={() => setSelected(project)}
                      aria-label={`Abrir projeto ${project.title}`}
                    >
                      <ProjectCard project={project} />
                    </button>
                  </Reveal>
                </div>
              ))}
            </div>

            <p className="md:hidden mt-3 text-center text-xs text-stone-400 tracking-widest uppercase">
              Arraste para o lado →
            </p>

            <style>{`
              .no-scrollbar::-webkit-scrollbar { display: none; }
              .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6">
            {filtered.map((project, i) => (
              <Reveal key={project.id || i} delay={`${(i % 5) * 100}ms`}>
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setSelected(project)}
                  aria-label={`Abrir projeto ${project.title}`}
                >
                  <ProjectCard project={project} />
                </button>
              </Reveal>
            ))}
          </div>
        )}
      </div>

      <ProjectModal open={!!selected} project={selected} onClose={() => setSelected(null)} />
    </section>
  );
}