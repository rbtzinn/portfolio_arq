import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { state, damp } from '../store.js'
import { bouquetActive } from '../lib/input.js'
import { click } from '../lib/audio.js'

// Cursor com inércia: cresce sobre links, fica magnético em botões, vira pílula com
// instrução no buquê e brasa quente no escuro. Some em telas de toque.
const MAGNETIC = '.btn, .sound, .brand, .bq-hint, .rail__dot'

export default function Cursor() {
  const ring = useRef()
  const dot = useRef()
  const label = useRef()

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return
    document.documentElement.classList.add('has-cursor')
    const pos = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2, s: 1, seen: false }
    let hover = null
    let down = false
    let last = performance.now()
    let magnet = null

    const onMove = (e) => {
      pos.x = e.clientX
      pos.y = e.clientY
      pos.seen = true
      const h = e.target.closest?.('a, button') || null
      if (h && h !== hover) click({ pitch: 2.2, gain: 0.12 }) // tique suave ao entrar num botão
      hover = h
      const m = e.target.closest?.(MAGNETIC) || null
      if (magnet && magnet !== m) magnet.style.translate = ''
      magnet = m
    }
    const onLeave = () => (pos.seen = false)
    const onDown = () => (down = true)
    const onUp = () => (down = false)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    document.addEventListener('pointerleave', onLeave)

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      pos.rx = damp(pos.rx, pos.x, 14, dt)
      pos.ry = damp(pos.ry, pos.y, 14, dt)

      // botão magnético: o elemento se inclina na direção do cursor
      if (magnet) {
        const r = magnet.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        magnet.style.translate = `${((pos.x - cx) * 0.22).toFixed(1)}px ${((pos.y - cy) * 0.28).toFixed(1)}px`
      }

      const B = state.bouquet
      const dark = state.p < 0.085
      const inBouquet = bouquetActive() && !hover
      let text = ''
      if (inBouquet) text = B.mode === 'idle' ? (down ? 'Girando' : 'Arraste · Clique') : B.mode === 'exploded' ? 'Clique · Remontar' : ''
      else if (dark && !hover) text = 'Luz'
      if (label.current.textContent !== text) label.current.textContent = text

      const target = hover ? 2.2 : down ? 0.8 : 1
      pos.s = damp(pos.s, target, 12, dt)
      const el = ring.current
      el.classList.toggle('is-pill', !!text)
      el.classList.toggle('is-hover', !!hover)
      el.classList.toggle('is-dark', dark)
      el.style.opacity = pos.seen ? '1' : '0'
      el.style.transform = `translate3d(${pos.rx.toFixed(1)}px, ${pos.ry.toFixed(1)}px, 0) scale(${text ? 1 : pos.s.toFixed(3)})`
      dot.current.style.opacity = pos.seen && !text ? '1' : '0'
      dot.current.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`
    }
    gsap.ticker.add(tick)
    return () => {
      gsap.ticker.remove(tick)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointerleave', onLeave)
      document.documentElement.classList.remove('has-cursor')
    }
  }, [])

  return (
    <div className="cursor" aria-hidden="true">
      <div ref={ring} className="cursor__ring">
        <span ref={label} className="cursor__label mono" />
      </div>
      <div ref={dot} className="cursor__dot" />
    </div>
  )
}

// Grão de filme: ruído gerado em canvas (sem arquivo), animado em passos.
export function Grain() {
  const el = useRef()
  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 160
    const x = c.getContext('2d')
    const img = x.createImageData(160, 160)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
    x.putImageData(img, 0, 0)
    el.current.style.backgroundImage = `url(${c.toDataURL('image/png')})`
  }, [])
  return <div ref={el} className="grain" aria-hidden="true" />
}
