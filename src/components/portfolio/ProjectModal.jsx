import React, { useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-stone-200/60 last:border-0">
      <span className="text-xs tracking-widest uppercase text-stone-400 font-medium">{label}</span>
      <span className="text-sm text-stone-700 font-medium text-right">{value}</span>
    </div>
  );
}

export default function ProjectModal({ open, project, onClose }) {
  const images = useMemo(() => {
    const arr = project?.images ?? [];
    // fallback: se não tiver images, tenta usar coverUrl
    if (arr.length) return arr;
    if (project?.coverUrl) return [project.coverUrl];
    return [];
  }, [project]);

  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open, project?.id]);

  const prev = () => {
    if (!images.length) return;
    setActiveIndex((i) => (i - 1 + images.length) % images.length);
  };

  const next = () => {
    if (!images.length) return;
    setActiveIndex((i) => (i + 1) % images.length);
  };

  // ESC fecha + setas navegam
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, images.length]);

  // trava scroll do body
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow || 'auto';
    };
  }, [open]);

  if (!open || !project) return null;

  const activeSrc = images[activeIndex] || project.coverUrl;

  return (
    <div className="fixed inset-0 z-[999]">
      {/* Backdrop (clicar fora fecha) */}
      <button
        className="absolute inset-0 bg-stone-900/70 backdrop-blur-sm transition-opacity animate-[fadeIn_.25s_ease-out] cursor-default w-full h-full"
        onClick={onClose}
        aria-label="Fechar modal"
        type="button"
      />

      {/* Modal container */}
      <div className="relative h-full w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 pointer-events-none">
        {/* max-w-6xl dá mais espaço geral que o 5xl */}
        <div className="w-full max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden animate-[popIn_.25s_ease-out] pointer-events-auto flex flex-col max-h-full">
          
          {/* Header */}
          <div className="flex items-start justify-between gap-6 p-6 lg:px-8 lg:py-6 border-b border-stone-100 shrink-0">
            <div>
              <p className="text-xs tracking-widest uppercase text-stone-400 mb-2 font-medium">
                {project.category}
              </p>
              <h3 className="text-2xl md:text-3xl font-light text-stone-900">
                {project.title}
              </h3>
            </div>

            <button
              onClick={onClose}
              className="p-2.5 rounded-full hover:bg-stone-100 text-stone-500 hover:text-stone-900 transition-colors"
              aria-label="Fechar"
              type="button"
            >
              <X size={24} strokeWidth={1.5} />
            </button>
          </div>

          {/* Body */}
          {/* Largura da sidebar aumentada para 380px (antes era 260px) */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] overflow-hidden">
            
            {/* Imagem principal */}
            <div className="relative bg-stone-100 flex items-center justify-center">
              {activeSrc ? (
                <img
                  src={activeSrc}
                  alt={`${project.title} - imagem ${activeIndex + 1}`}
                  className="w-full h-[40vh] lg:h-[72vh] object-cover"
                />
              ) : (
                <div className="w-full h-[40vh] lg:h-[72vh] flex items-center justify-center text-stone-500">
                  Sem imagem
                </div>
              )}

              {/* Controles */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={prev}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/90 hover:bg-white transition-colors shadow-lg hover:scale-105 active:scale-95"
                    aria-label="Imagem anterior"
                    type="button"
                  >
                    <ChevronLeft size={24} strokeWidth={1.5} className="text-stone-800" />
                  </button>

                  <button
                    onClick={next}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/90 hover:bg-white transition-colors shadow-lg hover:scale-105 active:scale-95"
                    aria-label="Próxima imagem"
                    type="button"
                  >
                    <ChevronRight size={24} strokeWidth={1.5} className="text-stone-800" />
                  </button>

                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-stone-900/70 backdrop-blur-md text-white text-xs px-4 py-1.5 rounded-full tracking-widest font-medium shadow-sm">
                    {activeIndex + 1} / {images.length}
                  </div>
                </>
              )}
            </div>

            {/* Sidebar com Scroll Independente */}
            {/* h-[72vh] + overflow-y-auto garante que não estoure o modal */}
            <div className="p-6 lg:p-8 border-t lg:border-t-0 lg:border-l border-stone-100 bg-white h-auto lg:h-[72vh] overflow-y-auto custom-scrollbar">
              
              {/* Miniaturas */}
              {!!images.length && (
                <div className="mb-10">
                  <p className="text-xs tracking-widest uppercase text-stone-400 mb-4 font-medium">
                    Galeria
                  </p>

                  <div className="grid grid-cols-4 lg:grid-cols-2 gap-4">
                    {images.map((src, idx) => {
                      const active = idx === activeIndex;
                      return (
                        <button
                          key={`${src}-${idx}`}
                          onClick={() => setActiveIndex(idx)}
                          className={`relative overflow-hidden rounded-xl aspect-[4/3] bg-stone-200 transition-all duration-300 ${
                            active ? 'ring-2 ring-stone-900 ring-offset-2 scale-[1.02]' : 'hover:scale-[1.02] hover:shadow-md'
                          }`}
                          type="button"
                          aria-label={`Ver miniatura ${idx + 1}`}
                        >
                          <img
                            src={src}
                            alt={`Miniatura ${idx + 1}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          <div
                            className={`absolute inset-0 transition-opacity duration-300 ${
                              active ? 'opacity-0' : 'opacity-20 bg-stone-900 hover:opacity-0'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Infos editáveis via planilha */}
              <div>
                <p className="text-xs tracking-widest uppercase text-stone-400 mb-4 font-medium">
                  Sobre o projeto
                </p>

                {project.description ? (
                  <p className="text-stone-600 font-light leading-loose text-sm">
                    {project.description}
                  </p>
                ) : (
                  <p className="text-stone-400 font-light text-sm italic">
                    (Sem descrição — você pode preencher no Google Sheets)
                  </p>
                )}

                <div className="mt-8 rounded-2xl border border-stone-100 bg-stone-50/80 p-5 shadow-sm">
                  <InfoRow label="Local" value={project.location} />
                  <InfoRow label="Ano" value={project.year} />
                  <InfoRow
                    label="Área"
                    value={project.areaM2 ? `${project.areaM2} m²` : ''}
                  />
                  <InfoRow label="Cliente" value={project.client} />
                </div>

                {!!(project.services?.length) && (
                  <div className="mt-8">
                    <p className="text-xs tracking-widest uppercase text-stone-400 mb-4 font-medium">
                      Serviços
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {project.services.map((s) => (
                        <span
                          key={s}
                          className="px-4 py-1.5 rounded-full text-xs tracking-widest uppercase border border-stone-200 text-stone-600 bg-white shadow-sm"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-10 pt-6 border-t border-stone-100 text-stone-400 text-xs font-light leading-relaxed">
                  Dica: use <kbd className="font-sans px-1 py-0.5 bg-stone-100 rounded text-stone-500">ESC</kbd> para fechar e as setas <kbd className="font-sans px-1 py-0.5 bg-stone-100 rounded text-stone-500">←</kbd> <kbd className="font-sans px-1 py-0.5 bg-stone-100 rounded text-stone-500">→</kbd> para navegar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframes e Scrollbar customizada */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes popIn {
          from { opacity: 0; transform: translateY(10px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        
        /* Scrollbar elegante para a barra lateral */
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #e7e5e4; /* stone-200 */
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #d6d3d1; /* stone-300 */
        }
      `}</style>
    </div>
  );
}