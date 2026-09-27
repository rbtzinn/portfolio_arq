import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { SequencePlayer, detectFormat } from './SequencePlayer.js'
import { state, damp, clamp, smooth, invLerp, lerp } from '../store.js'

// Canvas de fundo com a sequência renderizada no Blender. Também é o "relógio" da cena:
// suaviza o progresso e o ponteiro, posiciona as etiquetas e alimenta o contador de peças.
export default function Sequence({ onManifest }) {
  const canvas = useRef()

  useEffect(() => {
    let player = null
    let alive = true
    let last = performance.now()
    let lastFs = 0
    let dir = 1
    let fsDisp = 0
    let pointerSeen = false
    const onPointer = () => (pointerSeen = true)
    window.addEventListener('pointermove', onPointer, { once: true })

    const init = async () => {
      const forced = new URLSearchParams(location.search).get('fmt')
      const [manifest, ext] = await Promise.all([
        fetch('/seq/manifest.json').then((r) => r.json()),
        forced === 'webp' || forced === 'avif' ? forced : detectFormat(),
      ])
      if (!alive) return
      const portrait = window.innerWidth / window.innerHeight < 0.9
      const variant = portrait && manifest.variants.mobile ? 'mobile' : 'desktop'
      player = new SequencePlayer(canvas.current, manifest, variant, ext)
      player.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
      state.seq = { manifest, variant, player }
      state.totalPieces = manifest.built[manifest.built.length - 1] + (state.bouquetCount || 0)
      onManifest?.(manifest, variant)

      // pronto quando o primeiro passo grosso (1 a cada 16) chegou
      const coarse = Math.ceil(player.src.main.length / 16) + Math.ceil(player.src.lit.length / 4) + 1
      let readySent = false
      player.load((n, total) => {
        window.dispatchEvent(new CustomEvent('jardim:progress', { detail: n / total }))
        if (!readySent && n >= coarse) {
          readySent = true
          // decodifica o primeiro frame antes de revelar
          const check = () => (player.nearest('main', 0) ? ready() : setTimeout(check, 30))
          check()
        }
      }).then(() => window.dispatchEvent(new Event('jardim:loaded')))
    }
    const ready = () => {
      state.ready = true
      window.dispatchEvent(new Event('jardim:ready'))
    }
    init()

    const onResize = () => player?.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
    window.addEventListener('resize', onResize)

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      state.p = damp(state.p, state.progress, 7, dt)
      const pt = state.pointer
      const t = now / 1000
      // sem mouse (toque) a lanterna passeia sozinha; giroscópio assume quando existe
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
      if (!player) return

      const m = state.seq.manifest
      const P = state.p
      // em movimento: posição fracionária (crossfade); parado: assenta no frame inteiro
      // mais próximo, sem dupla exposição
      const target = clamp(P / m.seqEnd) * (m.frames - 1)
      const idle = Math.abs(state.progress - state.p) < 0.0004
      fsDisp = idle ? damp(fsDisp, Math.round(target), 9, dt) : target
      if (idle && Math.abs(fsDisp - Math.round(target)) < 0.01) fsDisp = Math.round(target)
      const fs = fsDisp
      if (Math.abs(fs - lastFs) > 0.01) dir = fs > lastFs ? 1 : -1
      lastFs = fs

      // paralaxe sutil; some no fim para o buquê em tempo real alinhar com o plate
      const par = 1 - smooth(invLerp(0.8, 0.87, P))
      const W = window.innerWidth
      const H = window.innerHeight
      const torchAmt = 1 - smooth(invLerp(0.07, 0.1, P))
      player.draw(fs, {
        zoom: 1 + 0.025 * par,
        px: -pt.sx * 10 * par,
        py: pt.sy * 7 * par,
        dir,
        torch: { x: (pt.sx * 0.5 + 0.5) * W, y: (-pt.sy * 0.5 + 0.5) * H, amount: torchAmt },
      })

      // peças montadas (dados exportados por frame)
      state.built = m.built[Math.round(fs)] || 0

      // etiquetas dos projetos
      const L = m.labels[state.seq.variant]
      const f0 = Math.floor(fs)
      const f1 = Math.min(m.frames - 1, f0 + 1)
      const k = fs - f0
      const els = state.labelEls || []
      const fadeEnd = 1 - smooth(invLerp(0.82, 0.86, P))
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        const a = L[f0]?.[i]
        const b = L[f1]?.[i]
        if (!el || !a || !b) continue
        const [x, y] = player.project(lerp(a[0], b[0], k), lerp(a[1], b[1], k))
        const edge = clamp(Math.min(x, W - x) / 120) * clamp(Math.min(y, H - y) / 100)
        const o = lerp(a[2], b[2], k) * edge * fadeEnd
        el.style.opacity = o.toFixed(3)
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
        el.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
      }
    }
    gsap.ticker.add(tick)
    return () => {
      alive = false
      gsap.ticker.remove(tick)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointermove', onPointer)
      player?.dispose()
    }
  }, [onManifest])

  return <canvas ref={canvas} className="seq" aria-label="Animação: peças de montar formam uma flor e um jardim" role="img" />
}
