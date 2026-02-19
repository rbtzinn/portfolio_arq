import React, { useState } from 'react';
import Reveal from '../common/Reveal.jsx';
import ProjectCard from '../portfolio/ProjectCard.jsx';
import ProjectModal from '../portfolio/ProjectModal.jsx';
import { useProjects } from '../../hooks/useProjects.js';

export default function Portfolio() {
  const { projects, loading } = useProjects();
  const [selected, setSelected] = useState(null);

  return (
    <section id="projetos" className="py-24 md:py-32 bg-stone-50">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="text-center mb-16">
          <Reveal>
            <h2 className="text-sm tracking-widest uppercase text-stone-500 mb-4">Portfólio</h2>
          </Reveal>
          <Reveal delay="100ms">
            <h3 className="text-4xl md:text-5xl font-light text-stone-900">Projetos Selecionados</h3>
          </Reveal>
        </div>

        {loading ? (
          <div className="text-center text-stone-500">Carregando projetos...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {projects.map((project, i) => (
              <Reveal key={project.id || i} delay={`${(i % 3) * 150}ms`}>
                <button
                  type="button"
                  className="text-left"
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
