import React, { useEffect, useState } from 'react';

import Navbar from './components/layout/Navbar.jsx';
import Hero from './components/sections/Hero.jsx';
import About from './components/sections/About.jsx';
import Portfolio from './components/sections/Portfolio.jsx';
import Services from './components/sections/Services.jsx';
import ContactFooter from './components/sections/ContactFooter.jsx';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Detecta scroll da página (para navbar)
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Trava o scroll quando o menu mobile está aberto
  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : 'auto';
  }, [isMenuOpen]);

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 font-sans selection:bg-stone-200">
      <Navbar
        isScrolled={isScrolled}
        isMenuOpen={isMenuOpen}
        onToggleMenu={() => setIsMenuOpen((v) => !v)}
        onCloseMenu={() => setIsMenuOpen(false)}
      />

      <Hero />

      <About />

      <Portfolio />

      <Services />

      <ContactFooter />
    </div>
  );
}
