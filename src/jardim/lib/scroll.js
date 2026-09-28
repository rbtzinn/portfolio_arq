import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { state } from '../store.js'

gsap.registerPlugin(ScrollTrigger)

let lenis = null
let st = null
const clamp01 = (v) => Math.min(1, Math.max(0, v))

export function setupScroll(track) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  lenis = new Lenis({ lerp: reduce ? 1 : 0.085, wheelMultiplier: 0.85, touchMultiplier: 1.3 })
  lenis.on('scroll', ScrollTrigger.update)
  // hero: 0 no topo da página → 1 quando a primeira tela saiu (é onde a experiência começa)
  const heroTrack = (y) => (state.hero = clamp01(y / (st ? st.start || window.innerHeight : window.innerHeight)))
  lenis.on('scroll', (e) => heroTrack(e.scroll))
  const tick = (time) => lenis.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  st = ScrollTrigger.create({
    trigger: track,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => {
      state.progress = self.progress
      state.velocity = self.getVelocity() / 1000
    },
  })

  // atalho para testes/screenshots: ?p=0.42 ou window.__jump(0.42)
  window.__state = state
  // p < 0 → dentro do hero: -1 = topo da página, -0.5 = meio da transição
  window.__jump = (p) => {
    const y = p < 0 ? (1 + p) * (st.start || window.innerHeight) : yOf(p)
    lenis.scrollTo(y, { immediate: true, force: true })
    ScrollTrigger.update()
    heroTrack(y)
    state.progress = Math.max(0, p)
    state.p = Math.max(0, p)
  }
  const qp = new URLSearchParams(location.search).get('p')
  if (qp) requestAnimationFrame(() => window.__jump(parseFloat(qp)))

  heroTrack(window.scrollY)
  return () => {
    st.kill()
    st = null
    gsap.ticker.remove(tick)
    lenis.destroy()
  }
}

// posição de scroll (px) de um progresso da experiência (0..1), depois do hero
const yOf = (p) => (st ? st.start + p * (st.end - st.start) : p * (document.documentElement.scrollHeight - window.innerHeight))

const ease = (t) => 1 - Math.pow(1 - t, 4)

export function scrollToProgress(p) {
  lenis?.scrollTo(yOf(p), { duration: 2.2, easing: ease })
}

export function scrollToTop() {
  lenis?.scrollTo(0, { duration: 2.2, easing: ease })
}
