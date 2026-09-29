import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { state, animAt } from '../store.js'

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
      state.scroll = self.progress
      state.progress = animAt(self.progress)
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
    state.scroll = state.sp = Math.max(0, p)
    state.progress = state.p = animAt(Math.max(0, p))
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

// começa e termina devagar: sem o pico de velocidade inicial que o vídeo não acompanha
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// inverso de animAt (monótona): posição do scroll para um tempo da animação
function scrollAt(P) {
  let lo = 0
  let hi = 1
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    if (animAt(mid) < P) lo = mid
    else hi = mid
  }
  return hi
}

let trip = null
const cancelTrip = () => {
  if (!trip) return
  trip.kill()
  trip = null
  state.navigating = false
}
if (typeof window !== 'undefined')
  for (const ev of ['wheel', 'touchstart', 'keydown']) window.addEventListener(ev, cancelTrip, { passive: true })

// Navegação por clique: a viagem é animada no TEMPO DA ANIMAÇÃO (não na posição do scroll),
// então o vídeo passa num ritmo uniforme até o destino — sem ficar parado atravessando as
// pausas e sem correr mais do que a busca de quadros acompanha (~80 quadros/s no pico).
// Os textos das pausas do caminho ficam ocultos até chegar.
function travel(targetS, then) {
  if (!lenis) return
  cancelTrip()
  const from = state.p
  const to = animAt(targetS)
  const frames = (Math.abs(to - from) / 0.88) * 360
  const duration = Math.min(4.2, Math.max(0.9, 0.6 + frames / 80))
  const o = { u: 0 }
  state.navigating = true
  trip = gsap.to(o, {
    u: 1,
    duration,
    ease: 'none',
    onUpdate: () => {
      const P = from + (to - from) * ease(o.u)
      // na pausa de destino, a posição exata pedida (dentro dela o tempo quase não muda)
      const s = o.u >= 1 ? targetS : scrollAt(P)
      lenis.scrollTo(yOf(s), { immediate: true, force: true })
    },
    onComplete: () => {
      trip = null
      state.navigating = false
      then?.()
    },
  })
}

export function scrollToProgress(p) {
  travel(p)
}

// volta ao hero: desmonta até o começo e então sobe a primeira tela
export function scrollToTop() {
  const done = () => lenis?.scrollTo(0, { duration: 1.1, easing: ease })
  if (state.hero < 1) return done()
  travel(0, done)
}
