import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { state } from '../store.js'

gsap.registerPlugin(ScrollTrigger)

let lenis = null

export function setupScroll(track) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  lenis = new Lenis({ lerp: reduce ? 1 : 0.085, wheelMultiplier: 0.85, touchMultiplier: 1.3 })
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (time) => lenis.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  const st = ScrollTrigger.create({
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
  window.__jump = (p) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    lenis.scrollTo(p * max, { immediate: true, force: true })
    ScrollTrigger.update()
    state.progress = p
    state.p = p
  }
  const qp = new URLSearchParams(location.search).get('p')
  if (qp) requestAnimationFrame(() => window.__jump(parseFloat(qp)))

  return () => {
    st.kill()
    gsap.ticker.remove(tick)
    lenis.destroy()
  }
}

export function scrollToProgress(p) {
  if (!lenis) return
  const max = document.documentElement.scrollHeight - window.innerHeight
  lenis.scrollTo(p * max, { duration: 2.2, easing: (t) => 1 - Math.pow(1 - t, 4) })
}
