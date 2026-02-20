import React, { useEffect, useState } from 'react';

import Navbar from './components/layout/Navbar.jsx';
import Hero from './components/sections/Hero.jsx';
import About from './components/sections/About.jsx';
import Portfolio from './components/sections/Portfolio.jsx';
// import Process from './components/sections/Process.jsx';
import Services from './components/sections/Services.jsx';
// import Testimonials from './components/sections/Testimonials.jsx';
import ContactFooter from './components/sections/ContactFooter.jsx';
import FloatingWhatsApp from './components/common/FloatingWhatsApp.jsx';

export default function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      {/* <Process /> */}
      <Services />
      {/* <Testimonials /> */}
      <ContactFooter />

      <FloatingWhatsApp />
    </div>
  );
}
