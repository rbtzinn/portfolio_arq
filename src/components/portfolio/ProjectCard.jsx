import React from "react";

export default function ProjectCard({ project }) {
  return (
    <div className="group relative w-full overflow-hidden cursor-pointer aspect-[4/5] bg-stone-200 rounded-sm">
      <img
        src={project.coverUrl}
        alt={project.title}
        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
        loading="lazy"
        decoding="async"
      />

      {/* Overlay Hover */}
      <div className="absolute inset-0 bg-stone-900/20 group-hover:bg-stone-900/60 transition-colors duration-500 flex flex-col justify-end p-8 opacity-0 group-hover:opacity-100">
        <span className="text-stone-300 text-sm tracking-widest uppercase mb-2 translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
          {project.category}
        </span>
        <h4 className="text-white text-2xl font-light translate-y-4 group-hover:translate-y-0 transition-transform duration-500 delay-75">
          {project.title}
        </h4>
      </div>
    </div>
  );
}
