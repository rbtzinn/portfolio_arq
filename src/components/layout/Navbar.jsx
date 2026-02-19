import React from 'react';
import { Menu, X } from 'lucide-react';

export default function Navbar({ isScrolled, isMenuOpen, onToggleMenu, onCloseMenu }) {
  return (
    <nav
      className={`fixed w-full z-50 transition-all duration-500 ${
        isScrolled ? 'bg-white/90 backdrop-blur-md py-4 shadow-sm' : 'bg-transparent py-6'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 flex justify-between items-center">
        <a href="#" className="text-2xl font-light tracking-widest uppercase text-stone-900 z-50">
          Helena<span className="font-bold">Costa</span>
        </a>

        {/* Desktop Menu */}
        <div className="hidden md:flex space-x-10 text-sm tracking-widest uppercase">
          <a href="#sobre" className="hover:text-stone-500 transition-colors">
            Sobre
          </a>
          <a href="#projetos" className="hover:text-stone-500 transition-colors">
            Projetos
          </a>
          <a href="#servicos" className="hover:text-stone-500 transition-colors">
            Serviços
          </a>
          <a href="#contato" className="hover:text-stone-500 transition-colors">
            Contato
          </a>
        </div>

        {/* Mobile Menu Button */}
        <button className="md:hidden z-50 text-stone-900" onClick={onToggleMenu} aria-label="Abrir menu">
          {isMenuOpen ? <X size={28} strokeWidth={1.5} /> : <Menu size={28} strokeWidth={1.5} />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <div
        className={`fixed inset-0 bg-white z-40 flex flex-col items-center justify-center space-y-8 transition-all duration-500 ease-in-out md:hidden ${
          isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
      >
        <a href="#sobre" onClick={onCloseMenu} className="text-2xl font-light tracking-widest uppercase hover:text-stone-500">
          Sobre
        </a>
        <a href="#projetos" onClick={onCloseMenu} className="text-2xl font-light tracking-widest uppercase hover:text-stone-500">
          Projetos
        </a>
        <a href="#servicos" onClick={onCloseMenu} className="text-2xl font-light tracking-widest uppercase hover:text-stone-500">
          Serviços
        </a>
        <a href="#contato" onClick={onCloseMenu} className="text-2xl font-light tracking-widest uppercase hover:text-stone-500">
          Contato
        </a>
      </div>
    </nav>
  );
}
