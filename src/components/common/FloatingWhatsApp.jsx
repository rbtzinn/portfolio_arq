import React from 'react';
import { MessageCircle } from 'lucide-react';
import { buildWhatsAppUrl } from '../../utils/whatsapp.js';

export default function FloatingWhatsApp() {
  const phone = import.meta.env.VITE_WHATSAPP_NUMBER;

  const href = buildWhatsAppUrl({
    phone,
    message: 'Quero solicitar um orçamento. Podemos conversar?',
  });

  if (!phone) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed right-5 bottom-5 z-[80] inline-flex items-center gap-2 rounded-full bg-stone-900 text-white px-4 py-3 shadow-lg hover:bg-stone-800 transition-colors"
      aria-label="Falar no WhatsApp"
    >
      <MessageCircle size={18} strokeWidth={1.5} />
      <span className="text-sm tracking-widest uppercase">WhatsApp</span>
    </a>
  );
}
