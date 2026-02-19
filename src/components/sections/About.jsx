import React from 'react';
import Reveal from '../common/Reveal.jsx';

export default function About() {
  return (
    <section id="sobre" className="py-24 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="flex flex-col md:flex-row items-center gap-16">
          <div className="w-full md:w-1/2 relative">
            <Reveal>
              <div className="absolute -inset-4 bg-stone-100 rounded-lg transform -rotate-2"></div>
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=800"
                alt="Retrato da Arquiteta"
                className="relative z-10 w-full h-[600px] object-cover rounded-sm shadow-xl grayscale hover:grayscale-0 transition-all duration-700"
              />
            </Reveal>
          </div>

          <div className="w-full md:w-1/2">
            <Reveal delay="100ms">
              <h2 className="text-sm tracking-widest uppercase text-stone-500 mb-4">A Arquiteta</h2>
            </Reveal>

            <Reveal delay="200ms">
              <h3 className="text-4xl md:text-5xl font-light mb-8 text-stone-900">
                Criando harmonia entre <span className="font-serif italic">forma</span> e <span className="font-serif italic">função</span>.
              </h3>
            </Reveal>

            <Reveal delay="300ms">
              <div className="space-y-6 text-stone-600 font-light leading-relaxed text-lg">
                <p>
                  Olá, sou Helena Costa. Acredito que a arquitetura vai muito além de erguer paredes; trata-se de esculpir o vazio para criar
                  experiências significativas e atemporais.
                </p>
                <p>
                  Com mais de 10 anos de experiência em projetos residenciais e comerciais de alto padrão, busco sempre a essência do material,
                  a pureza das linhas e a integração perfeita com a natureza e a luz natural.
                </p>
              </div>
            </Reveal>

            <Reveal delay="400ms">
              <img
                src="https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Signature_of_John_Hancock.svg/1200px-Signature_of_John_Hancock.svg.png"
                alt="Assinatura"
                className="h-16 mt-10 opacity-60 invert"
              />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
