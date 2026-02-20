import React, { useMemo, useState } from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';
import Reveal from '../common/Reveal.jsx';
import { buildWhatsAppUrl } from '../../utils/whatsapp.js';

export default function ContactFooter() {
  const phone = import.meta.env.VITE_WHATSAPP_NUMBER;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const waHref = useMemo(() => {
    return buildWhatsAppUrl({ phone, name, email, message });
  }, [phone, name, email, message]);

  function onSubmit(e) {
    e.preventDefault();
    setSent(false);

    if (!phone) {
      alert('WhatsApp não configurado. Adicione VITE_WHATSAPP_NUMBER no .env / Vercel.');
      return;
    }

    // Abre WhatsApp com a mensagem montada
    window.open(waHref, '_blank', 'noopener,noreferrer');

    // Feedback visual e limpa campos
    setSent(true);
    setName('');
    setEmail('');
    setMessage('');
  }

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
              Envie uma mensagem no WhatsApp com os detalhes do seu projeto.
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

            <p className="mt-8 text-xs text-stone-400 font-light leading-relaxed">
              Ao clicar em “Enviar Mensagem”, você será redirecionado(a) para o WhatsApp com o texto já preenchido.
            </p>
          </Reveal>

          <Reveal delay="200ms">
            <form className="space-y-6" onSubmit={onSubmit}>
              <div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  type="text"
                  placeholder="O seu Nome"
                  required
                  className="w-full bg-transparent border-b border-stone-300 py-3 text-stone-900 focus:outline-none focus:border-stone-900 transition-colors font-light placeholder-stone-400"
                />
              </div>

              <div>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="O seu E-mail"
                  required
                  className="w-full bg-transparent border-b border-stone-300 py-3 text-stone-900 focus:outline-none focus:border-stone-900 transition-colors font-light placeholder-stone-400"
                />
              </div>

              <div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Fale sobre o seu projeto..."
                  rows="4"
                  required
                  className="w-full bg-transparent border-b border-stone-300 py-3 text-stone-900 focus:outline-none focus:border-stone-900 transition-colors font-light placeholder-stone-400 resize-none"
                />
              </div>

              <button
                type="submit"
                className="bg-stone-900 text-white px-8 py-4 uppercase tracking-widest text-sm hover:bg-stone-800 transition-colors w-full md:w-auto"
              >
                Enviar Mensagem (WhatsApp)
              </button>

              {sent && (
                <p className="text-sm text-stone-500 font-light">
                  Mensagem preparada ✅ (abrimos o WhatsApp em outra aba)
                </p>
              )}
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
