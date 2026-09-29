import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { Engine } from './Engine.js'
import { state, damp, clamp, smooth, invLerp, animAt } from '../store.js'
import { snapBurst, updateAmbient } from '../lib/audio.js'
import { setStyle, setClass } from '../lib/dom.js'

// Palco 3D em tempo real e "relógio" da cena: suaviza o scroll e o ponteiro, conduz o
// motor (Engine), posiciona as etiquetas dos projetos e alimenta o contador de peças.
export default function Scene3D() {
  const canvas = useRef()

  useEffect(() => {
    const coarse = matchMedia('(pointer: coarse)').matches
    const engine = Engine.create(canvas.current, { coarse })
    if (!engine) {
      // sem WebGL: o hero continua; a interface mostra o aviso
      window.dispatchEvent(new Event('jardim:error'))
      return
    }
    state.engine = engine
    state.totalPieces = engine.total
    state.bouquetCount = engine.bouquet.count

    // tamanho do palco: no celular, a altura grande da tela (barra de endereço escondida);
    // resize só de altura (a barra aparecendo/sumindo ao rolar) não recria o buffer
    const stage = canvas.current.parentElement
    let lastW = 0
    const onResize = () => {
      const w = stage.clientWidth || window.innerWidth
      if (coarse && w === lastW && engine.H) return
      lastW = w
      engine.resize(w, stage.clientHeight || window.innerHeight)
    }
    onResize()
    window.addEventListener('resize', onResize)

    let pointerSeen = false
    const onPointer = () => (pointerSeen = true)
    window.addEventListener('pointermove', onPointer, { once: true })

    // ?debug=1: quadros/s reais e chamadas de desenho
    let hud = null
    const fpsLog = []
    if (new URLSearchParams(location.search).has('debug')) {
      hud = document.createElement('pre')
      hud.style.cssText =
        'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:6px 8px;font:11px/1.35 monospace;background:rgb(0 0 0 / .72);color:#9f9;pointer-events:none;border-radius:4px'
      document.body.appendChild(hud)
    }

    const cardBox = new WeakMap()
    const labels = []
    let last = performance.now()
    let lastSig = ''
    let lastP = 0
    let draws = 0
    let first = true
    const announce = () => {
      first = false
      state.ready = true
      window.dispatchEvent(new CustomEvent('jardim:progress', { detail: 1 }))
      window.dispatchEvent(new Event('jardim:ready'))
      window.dispatchEvent(new Event('jardim:loaded'))
    }

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now

      state.sp = damp(state.sp, state.scroll, coarse ? 14 : 7, dt)
      state.p = animAt(state.sp)
      const P = state.p
      const dir = P >= lastP ? 1 : -1
      const scrolling = Math.abs(P - lastP) > 1e-5
      lastP = P

      // ponteiro suavizado; sem mouse (toque) a lanterna passeia sozinha, giroscópio assume
      const pt = state.pointer
      const t = now / 1000
      let gx = pt.x
      let gy = pt.y
      if (state.gyro.enabled) {
        gx = state.gyro.x
        gy = state.gyro.y
      } else if (!pointerSeen) {
        gx = Math.sin(t * 0.45) * 0.45
        gy = Math.sin(t * 0.61) * 0.3
      }
      pt.sx = damp(pt.sx, gx, 3, dt)
      pt.sy = damp(pt.sy, gy, 3, dt)

      // buquê: giro com inércia (o arraste soma em spinVel)
      const B = state.bouquet
      B.spinVel *= Math.exp(-dt * 2.5)
      B.spin += B.spinVel * dt

      // saindo do hero, a cena chega de perto; paralaxe some no buquê
      const heroIn = 1 - smooth(invLerp(0.2, 1, state.hero))
      const par = 1 - smooth(invLerp(0.8, 0.87, P))
      const torchAmt = 1 - smooth(invLerp(0.07, 0.1, P))
      const view = {
        zoom: 1 + 0.025 * par + 0.14 * heroIn,
        px: -pt.sx * 0.9 * par,
        py: pt.sy * 0.6 * par,
        torch: { x: pt.sx, y: pt.sy, amount: torchAmt },
      }

      // desenha só quando algo visível mudou (bateria/GPU) e quando o hero não cobre a tela
      const r3 = (v) => Math.round(v * 1000)
      const sig = [r3(P), r3(pt.sx), r3(pt.sy), r3(view.zoom), r3(B.spin), engine.W, engine.H].join()
      const busy = engine.bouquet.busy && P > 0.86
      // (o primeiro quadro sai mesmo com o hero na tela: compila os shaders antes do scroll)
      if (first || (state.hero > 0.25 && (sig !== lastSig || busy))) {
        lastSig = sig
        engine.update(P, view, now)
        engine.render()
        draws++
        if (first) announce()
      }

      // cada peça nova encaixada "estala"
      const built = engine.built
      if (built > (state.built || 0) && dir > 0 && scrolling) snapBurst(built - state.built)
      state.built = built
      updateAmbient(P, smooth(invLerp(0.085, 0.2, P)), Math.abs(state.velocity || 0))

      // etiquetas dos projetos (projetadas pela câmera ao vivo)
      const els = state.labelEls || []
      const W = engine.W
      const H = engine.H
      if (P > 0.5 && P < 0.9) engine.labels(P, labels)
      const fadeEnd = 1 - smooth(invLerp(0.82, 0.86, P))
      const afterText = smooth(invLerp(0.6, 0.612, state.sp)) // depois do texto do jardim
      const headerH = W <= 820 ? 96 : 84
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        const L = labels[i]
        if (!el) continue
        const vis = L && P > 0.5 && P < 0.9 ? L[2] * fadeEnd * afterText : 0
        if (vis <= 0.001) {
          setStyle(el, 'opacity', '0')
          setStyle(el, 'pointerEvents', 'none')
          continue
        }
        const [x, y] = L
        const flip = x > W * 0.58
        setClass(el, 'tag--left', flip)
        // medidas do cartão: lidas uma vez por lado/tamanho de tela (sem layout a cada quadro)
        const key = (flip ? 'L' : 'R') + W
        let box = cardBox.get(el)
        if (!box || box.key !== key) {
          const card = el.querySelector('.tag__card')
          box = { key, l: card ? card.offsetLeft : 48, t: card ? card.offsetTop : -64, w: card ? card.offsetWidth : 240 }
          cardBox.set(el, box)
        }
        const cl = x + box.l
        const ct = y + box.t
        // some antes de encostar nas bordas ou no cabeçalho
        const room = Math.min(cl - 12, W - 12 - (cl + box.w), ct - headerH, H - 24 - y)
        const o = vis * clamp(room / 60)
        setStyle(el, 'opacity', o.toFixed(2))
        setStyle(el, 'transform', `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0)`)
        setStyle(el, 'pointerEvents', o > 0.5 ? 'auto' : 'none')
      }

      if (hud) {
        fpsLog.push(now)
        while (fpsLog.length && now - fpsLog[0] > 1000) fpsLog.shift()
        if (fpsLog.length % 10 === 0)
          hud.textContent = `fps ${fpsLog.length}\ndesenhos ${draws}\ndraw calls ${engine.renderer.info.render.calls}\ntriângulos ${engine.renderer.info.render.triangles}`
      }
    }
    gsap.ticker.add(tick)
    return () => {
      gsap.ticker.remove(tick)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointer)
      hud?.remove()
      engine.renderer.dispose()
      state.engine = null
    }
  }, [])

  return <canvas ref={canvas} className="seq" aria-label="Animação 3D: peças de montar formam uma flor e um jardim" role="img" />
}
