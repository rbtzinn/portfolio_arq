import React from 'react';
import Reveal from '../common/Reveal.jsx';
import { buildWhatsAppUrl } from '../../utils/whatsapp.js';

export default function Hero() {
  const phone = import.meta.env.VITE_WHATSAPP_NUMBER;

  const waHref = buildWhatsAppUrl({
    phone,
    message: 'Olá! Gostaria de solicitar um orçamento.',
  });

  return (
    <header className="relative h-screen flex items-center justify-center overflow-hidden">
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&q=80&w=2000"
          alt="Arquitetura Moderna"
          className="w-full h-full object-cover animate-ken-burns"
        />
        <div className="absolute inset-0 bg-stone-900/30"></div>
      </div>

      <div className="relative z-10 text-center text-white px-6 mt-16">
        <Reveal>
          <h1 className="text-5xl md:text-7xl font-light tracking-tight mb-4">
            Espaços que <br />
            <span className="font-serif italic text-6xl md:text-8xl">Inspiram</span>
          </h1>
        </Reveal>

        <Reveal delay="200ms">
          <p className="text-lg md:text-xl font-light tracking-wide max-w-2xl mx-auto mb-10 text-stone-200">
            Arquitetura minimalista, design de interiores e criação de ambientes com propósito e alma.
          </p>
        </Reveal>

        <Reveal delay="400ms">
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="#projetos"
              className="inline-flex justify-center border border-white px-8 py-3 uppercase tracking-widest text-sm hover:bg-white hover:text-stone-900 transition-all duration-300"
            >
              Ver Projetos
            </a>

            {phone && (
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex justify-center bg-white text-stone-900 px-8 py-3 uppercase tracking-widest text-sm hover:bg-stone-100 transition-all duration-300"
              >
                Solicitar Orçamento
              </a>
            )}
          </div>
        </Reveal>
      </div>

      <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-10 animate-bounce">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </header>
  );
}
