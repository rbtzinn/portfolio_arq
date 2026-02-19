import React from 'react';
import { Home, Layout, Briefcase } from 'lucide-react';
import Reveal from '../common/Reveal.jsx';
import ServiceCard from '../services/ServiceCard.jsx';

export default function Services() {
  return (
    <section id="servicos" className="py-24 md:py-32 bg-stone-900 text-stone-100">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="text-center mb-20">
          <Reveal>
            <h2 className="text-sm tracking-widest uppercase text-stone-400 mb-4">Expertise</h2>
          </Reveal>
          <Reveal delay="100ms">
            <h3 className="text-4xl md:text-5xl font-light">Nossos Serviços</h3>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
          <Reveal delay="0ms">
            <ServiceCard
              icon={Home}
              title="Arquitetura Residencial"
              description="Projetos arquitetônicos completos para casas de alto padrão, focados em conforto, estética e sustentabilidade."
            />
          </Reveal>

          <Reveal delay="150ms">
            <ServiceCard
              icon={Layout}
              title="Design de Interiores"
              description="Concepção de ambientes internos sofisticados, escolha de materiais, mobiliário e projeto luminotécnico."
            />
          </Reveal>

          <Reveal delay="300ms">
            <ServiceCard
              icon={Briefcase}
              title="Consultoria Comercial"
              description="Desenvolvimento de identidade espacial para lojas, restaurantes e escritórios, alinhando marca e arquitetura."
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
