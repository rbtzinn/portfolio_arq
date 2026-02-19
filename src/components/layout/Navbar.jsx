import React from 'react';
import { Menu, X } from 'lucide-react';

const NavLink = ({ href, children, onClick, className = '' }) => (
  <a
    href={href}
    onClick={onClick}
    className={`hover:text-stone-500 transition-colors ${className}`}
  >
    {children}
  </a>
);

export default function Navbar({ isScrolled, isMenuOpen, onToggleMenu, onCloseMenu }) {
  return (
    <>
      <nav
        className={`fixed top-0 left-0 w-full z-50 transition-all duration-500 ${
          isScrolled ? 'bg-white/90 backdrop-blur-md py-4 shadow-sm' : 'bg-transparent py-6'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex justify-between items-center">
          <a href="#" className="text-2xl font-light tracking-widest uppercase text-stone-900 relative z-[70]">
            Helena<span className="font-bold">Costa</span>
          </a>

          {/* Desktop Menu */}
          <div className="hidden md:flex space-x-10 text-sm tracking-widest uppercase">
            <NavLink href="#sobre">Sobre</NavLink>
            <NavLink href="#projetos">Projetos</NavLink>
            <NavLink href="#servicos">Serviços</NavLink>
            <NavLink href="#contato">Contato</NavLink>
          </div>

          {/* Mobile Button */}
          <button
            className="md:hidden text-stone-900 relative z-[70] p-2 -mr-2"
            onClick={onToggleMenu}
            aria-label={isMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            type="button"
          >
            {isMenuOpen ? <X size={28} strokeWidth={1.5} /> : <Menu size={28} strokeWidth={1.5} />}
          </button>
        </div>
      </nav>

      {/* Mobile Overlay (fora do nav, z alto, com backdrop) */}
      <div
        className={`fixed inset-0 z-[60] md:hidden transition-all duration-300 ${
          isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
        }`}
      >
        {/* backdrop */}
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={onCloseMenu}
          className={`absolute inset-0 bg-stone-900/20 backdrop-blur-sm transition-opacity duration-300 ${
            isMenuOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* painel */}
        <div
          className={`absolute inset-x-0 top-0 bg-white pt-28 pb-10 px-8 transition-transform duration-300 ease-out ${
            isMenuOpen ? 'translate-y-0' : '-translate-y-6'
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-8">
            <NavLink
              href="#sobre"
              onClick={onCloseMenu}
              className="text-2xl font-light tracking-widest uppercase"
            >
              Sobre
            </NavLink>

            <NavLink
              href="#projetos"
              onClick={onCloseMenu}
              className="text-2xl font-light tracking-widest uppercase"
            >
              Projetos
            </NavLink>

            <NavLink
              href="#servicos"
              onClick={onCloseMenu}
              className="text-2xl font-light tracking-widest uppercase"
            >
              Serviços
            </NavLink>

            <NavLink
              href="#contato"
              onClick={onCloseMenu}
              className="text-2xl font-light tracking-widest uppercase"
            >
              Contato
            </NavLink>
          </div>
        </div>
      </div>
    </>
  );
}
