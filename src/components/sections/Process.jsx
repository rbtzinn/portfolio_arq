// import React from 'react';
// import Reveal from '../common/Reveal.jsx';

// const steps = [
//   { n: '01', title: 'Briefing', desc: 'Entendimento do seu objetivo, estilo e necessidades.' },
//   { n: '02', title: 'Conceito', desc: 'Moodboard, referências e diretrizes do projeto.' },
//   { n: '03', title: '3D & Materiais', desc: 'Imagens, escolhas de materiais e refinamento.' },
//   { n: '04', title: 'Executivo', desc: 'Detalhamento técnico para uma obra segura e fiel.' },
// ];

// export default function Process() {
//   return (
//     <section id="processo" className="py-24 md:py-32 bg-white">
//       <div className="max-w-7xl mx-auto px-6 md:px-12">
//         <div className="text-center mb-16">
//           <Reveal>
//             <h2 className="text-sm tracking-widest uppercase text-stone-500 mb-4">Método</h2>
//           </Reveal>
//           <Reveal delay="100ms">
//             <h3 className="text-4xl md:text-5xl font-light text-stone-900">Processo em 4 passos</h3>
//           </Reveal>
//         </div>

//         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
//           {steps.map((s, i) => (
//             <Reveal key={s.n} delay={`${i * 120}ms`}>
//               <div className="rounded-2xl border border-stone-200 bg-stone-50/50 p-6 hover:bg-white transition-colors">
//                 <p className="text-xs tracking-widest uppercase text-stone-400">{s.n}</p>
//                 <h4 className="text-xl font-light text-stone-900 mt-2">{s.title}</h4>
//                 <p className="text-stone-600 font-light leading-relaxed text-sm mt-3">{s.desc}</p>
//               </div>
//             </Reveal>
//           ))}
//         </div>
//       </div>
//     </section>
//   );
// }
