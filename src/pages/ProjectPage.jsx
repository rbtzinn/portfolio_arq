import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProjects } from "../hooks/useProjects.js";
import { slugify } from "../utils/slug.js";

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-stone-100">
      <span className="text-xs tracking-widest uppercase text-stone-400">{label}</span>
      <span className="text-sm text-stone-700 font-light text-right">{value}</span>
    </div>
  );
}

export default function ProjectPage() {
  const { slug } = useParams();
  const { projects, loading } = useProjects();

  const project = useMemo(() => {
    return (projects || []).find(p => slugify(p.title) === slug);
  }, [projects, slug]);

  const images = useMemo(() => {
    if (!project) return [];
    if (project.images?.length) return project.images;
    if (project.coverUrl) return [project.coverUrl];
    return [];
  }, [project]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [imgReady, setImgReady] = useState(false);

  useEffect(() => {
    setActiveIndex(0);
  }, [project?.id]);

  useEffect(() => {
    if (project?.title) document.title = `${project.title} — Helena Costa Arquitetura`;
    return () => { document.title = "Helena Costa Arquitetura"; };
  }, [project?.title]);

  useEffect(() => setImgReady(false), [activeIndex]);

  const prev = () => setActiveIndex(i => (i - 1 + images.length) % images.length);
  const next = () => setActiveIndex(i => (i + 1) % images.length);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 pt-28 px-6">
        <div className="max-w-5xl mx-auto text-stone-500">Carregando projeto...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-stone-50 pt-28 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-stone-700">Projeto não encontrado.</p>
          <Link to="/" className="inline-block mt-4 text-sm tracking-widest uppercase text-stone-900 hover:text-stone-500">
            Voltar para o início
          </Link>
        </div>
      </div>
    );
  }

  const activeSrc = images[activeIndex];

  return (
    <div className="min-h-screen bg-stone-50 pt-28 pb-20">
      <div className="max-w-5xl mx-auto px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-stone-500 hover:text-stone-900 transition-colors"
        >
          ← Voltar
        </Link>

        <div className="mt-6">
          <p className="text-xs tracking-widest uppercase text-stone-400">{project.category}</p>
          <h1 className="text-3xl md:text-5xl font-light text-stone-900 mt-2">{project.title}</h1>
        </div>

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
          {/* Galeria */}
          <div className="relative rounded-2xl overflow-hidden bg-stone-200">
            {activeSrc ? (
              <>
                <img
                  key={activeSrc}
                  src={activeSrc}
                  alt={`${project.title} - imagem ${activeIndex + 1}`}
                  onLoad={() => setImgReady(true)}
                  className={`w-full h-[55vh] lg:h-[70vh] object-cover transition-opacity duration-300 ${
                    imgReady ? "opacity-100" : "opacity-0"
                  }`}
                />
                {!imgReady && <div className="absolute inset-0 animate-pulse bg-stone-200" />}
              </>
            ) : (
              <div className="w-full h-[55vh] lg:h-[70vh] flex items-center justify-center text-stone-500">
                Sem imagem
              </div>
            )}

            {images.length > 1 && (
              <>
                <button
                  onClick={prev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white transition-colors shadow"
                  aria-label="Imagem anterior"
                  type="button"
                >
                  <ChevronLeft size={22} strokeWidth={1.5} />
                </button>
                <button
                  onClick={next}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 hover:bg-white transition-colors shadow"
                  aria-label="Próxima imagem"
                  type="button"
                >
                  <ChevronRight size={22} strokeWidth={1.5} />
                </button>

                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-stone-900/60 text-white text-xs px-3 py-1 rounded-full tracking-widest">
                  {activeIndex + 1}/{images.length}
                </div>
              </>
            )}
          </div>

          {/* Infos */}
          <div className="bg-white rounded-2xl border border-stone-200 p-6">
            <p className="text-sm tracking-widest uppercase text-stone-500 mb-3">Sobre o projeto</p>

            {project.description ? (
              <p className="text-stone-600 font-light leading-relaxed text-sm">{project.description}</p>
            ) : (
              <p className="text-stone-400 font-light text-sm">(Sem descrição)</p>
            )}

            <div className="mt-5 rounded-xl border border-stone-100 bg-stone-50/50 p-4">
              <InfoRow label="Local" value={project.location} />
              <InfoRow label="Ano" value={project.year} />
              <InfoRow label="Área" value={project.areaM2 ? `${project.areaM2} m²` : ""} />
              <InfoRow label="Cliente" value={project.client} />
            </div>

            {!!project.services?.length && (
              <div className="mt-4">
                <p className="text-xs tracking-widest uppercase text-stone-400 mb-2">Serviços</p>
                <div className="flex flex-wrap gap-2">
                  {project.services.map((s) => (
                    <span
                      key={s}
                      className="px-3 py-1 rounded-full text-xs tracking-widest uppercase border border-stone-200 text-stone-600 bg-white"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Miniaturas */}
            {!!images.length && (
              <div className="mt-6">
                <p className="text-xs tracking-widest uppercase text-stone-400 mb-2">Galeria</p>
                <div className="grid grid-cols-4 lg:grid-cols-2 gap-3">
                  {images.map((src, idx) => {
                    const active = idx === activeIndex;
                    return (
                      <button
                        key={`${src}-${idx}`}
                        onClick={() => setActiveIndex(idx)}
                        className={`relative overflow-hidden rounded-xl aspect-[4/3] bg-stone-200 transition-all ${
                          active ? "ring-2 ring-stone-900 scale-[1.01]" : "hover:scale-[1.01]"
                        }`}
                        type="button"
                        aria-label={`Ver miniatura ${idx + 1}`}
                      >
                        <img src={src} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
