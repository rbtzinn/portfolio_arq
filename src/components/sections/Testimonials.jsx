import React from 'react';
import Reveal from '../common/Reveal.jsx';

const testimonials = [
  {
    text: 'A entrega foi impecável, com atenção aos detalhes e muita clareza em cada etapa.',
    name: 'Mariana S.',
    role: 'Projeto Residencial',
  },
  {
    text: 'O projeto ficou sofisticado e funcional. A curadoria de materiais foi o grande diferencial.',
    name: 'Ricardo A.',
    role: 'Interiores',
  },
  {
    text: 'Processo organizado, prazos cumpridos e um resultado acima do esperado.',
    name: 'Camila P.',
    role: 'Comercial',
  },
];

export default function Testimonials() {
  return (
    <section id="depoimentos" className="py-24 md:py-32 bg-stone-50">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="text-center mb-16">
          <Reveal>
            <h2 className="text-sm tracking-widest uppercase text-stone-500 mb-4">Confiança</h2>
          </Reveal>
          <Reveal delay="100ms">
            <h3 className="text-4xl md:text-5xl font-light text-stone-900">Depoimentos</h3>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={`${i * 120}ms`}>
              <div className="rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
                <p className="text-stone-700 font-light leading-relaxed">
                  “{t.text}”
                </p>
                <div className="mt-6 pt-5 border-t border-stone-100">
                  <p className="text-sm tracking-widest uppercase text-stone-900">{t.name}</p>
                  <p className="text-xs tracking-widest uppercase text-stone-400 mt-1">{t.role}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
