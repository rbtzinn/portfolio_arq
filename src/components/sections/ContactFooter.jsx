import React from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';
import Reveal from '../common/Reveal.jsx';

export default function ContactFooter() {
  return (
    <footer id="contato" className="bg-white pt-24 pb-12 border-t border-stone-200">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 mb-20">
          <Reveal>
            <h2 className="text-4xl md:text-5xl font-light text-stone-900 mb-6">
              Vamos criar algo <br />
              <span className="font-serif italic">excepcional</span> juntos.
            </h2>
            <p className="text-stone-500 mb-8 max-w-md font-light text-lg">
              Seja para um novo projeto ou apenas para dizer olá, adoraríamos ouvir de si.
            </p>

            <div className="space-y-4 text-stone-600 font-light">
              <p className="flex items-center gap-3">
                <Mail size={18} strokeWidth={1.5} />
                contato@helenacosta.arq.br
              </p>
              <p className="flex items-center gap-3">
                <Phone size={18} strokeWidth={1.5} />
                +55 11 99999-0000
              </p>
              <p className="flex items-center gap-3">
                <MapPin size={18} strokeWidth={1.5} />
                Av. Paulista, 1000 - São Paulo, SP
              </p>
            </div>
          </Reveal>

          <Reveal delay="200ms">
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <div>
                <input
                  type="text"
                  placeholder="O seu Nome"
                  className="w-full bg-transparent border-b border-stone-300 py-3 text-stone-900 focus:outline-none focus:border-stone-900 transition-colors font-light placeholder-stone-400"
                />
              </div>
              <div>
                <input
                  type="email"
                  placeholder="O seu E-mail"
                  className="w-full bg-transparent border-b border-stone-300 py-3 text-stone-900 focus:outline-none focus:border-stone-900 transition-colors font-light placeholder-stone-400"
                />
              </div>
              <div>
                <textarea
                  placeholder="Fale sobre o seu projeto..."
                  rows="4"
                  className="w-full bg-transparent border-b border-stone-300 py-3 text-stone-900 focus:outline-none focus:border-stone-900 transition-colors font-light placeholder-stone-400 resize-none"
                ></textarea>
              </div>
              <button
                type="submit"
                className="bg-stone-900 text-white px-8 py-4 uppercase tracking-widest text-sm hover:bg-stone-800 transition-colors w-full md:w-auto"
              >
                Enviar Mensagem
              </button>
            </form>
          </Reveal>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-stone-100 text-sm text-stone-400 font-light">
          <p>&copy; 2026 Helena Costa Arquitetura. Todos os direitos reservados.</p>
          <div className="flex space-x-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-stone-900 transition-colors uppercase tracking-widest">
              Instagram
            </a>
            <a href="#" className="hover:text-stone-900 transition-colors uppercase tracking-widest">
              Pinterest
            </a>
            <a href="#" className="hover:text-stone-900 transition-colors uppercase tracking-widest">
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
