import React from 'react';

export default function ServiceCard({ icon: Icon, title, description }) {
  return (
    <div className="p-6">
      <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center border border-stone-700 rounded-full text-stone-300">
        <Icon size={28} strokeWidth={1.5} />
      </div>
      <h4 className="text-xl tracking-wide mb-4">{title}</h4>
      <p className="text-stone-400 font-light leading-relaxed text-sm">{description}</p>
    </div>
  );
}
