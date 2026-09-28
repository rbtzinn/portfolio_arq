import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { SequencePlayer, detectFormat } from './SequencePlayer.js'
import { state, damp, clamp, smooth, invLerp, lerp, bouquetAngle, animAt } from '../store.js'
import { snapBurst, updateAmbient } from '../lib/audio.js'
import { setStyle, setClass } from '../lib/dom.js'

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
    const cardBox = new WeakMap()
    let pointerSeen = false
    const onPointer = () => (pointerSeen = true)
    window.addEventListener('pointermove', onPointer, { once: true })

    const coarse = matchMedia('(pointer: coarse)').matches
    // tamanho do palco: no celular, a altura grande da tela (barra de endereço escondida)
    const stageSize = () => {
      const el = canvas.current.parentElement
      return [el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight, window.devicePixelRatio || 1]
    }
    let manifest = null
    let ext = 'webp'
    let readySent = false
    const pickVariant = () => {
      const portrait = window.innerWidth / window.innerHeight < 0.9
      return portrait && manifest.variants.mobile ? 'mobile' : 'desktop'
    }
    const ready = () => {
      if (readySent) return
      readySent = true
      state.ready = true
      window.dispatchEvent(new Event('jardim:ready'))
    }
    const fail = () => window.dispatchEvent(new Event('jardim:error'))

    // cria (ou recria, ao girar o aparelho) o player da variante certa
    const start = (variant) => {
      player?.dispose()
      const pl = new SequencePlayer(canvas.current, manifest, variant, ext)
      player = pl
      pl.resize(...stageSize())
      state.seq = { manifest, variant, player: pl }
      state.totalPieces = manifest.built[manifest.built.length - 1] + (state.bouquetCount || 0)
      onManifest?.(manifest, variant)

      if (pl.video) {
        // vídeo: pronto quando o arquivo chegou e o primeiro quadro está na GPU
        pl.onVideoReady = () => pl === player && ready()
        pl.load((f) => pl === player && window.dispatchEvent(new CustomEvent('jardim:progress', { detail: f })))
          .then(() => pl === player && window.dispatchEvent(new Event('jardim:loaded')))
          .catch(() => pl === player && fail())
        return
      }

      // pronto quando o primeiro passo grosso (1 a cada 16) chegou e o frame 0 decodificou
      const coarse = Math.ceil(pl.src.main.length / 16) + Math.ceil(pl.src.lit.length / 4) + 1
      const whenDecoded = (tries = 0) => {
        if (!alive || pl !== player) return
        if (pl.nearest('main', 0)) ready()
        else if (tries < 300) setTimeout(() => whenDecoded(tries + 1), 30)
        else fail()
      }
      let armed = false
      pl.load((f) => {
        if (pl !== player) return
        window.dispatchEvent(new CustomEvent('jardim:progress', { detail: f }))
        const n = pl.loaded
        if (!armed && n >= coarse) {
          armed = true
          whenDecoded()
        }
      }).then(() => {
        if (pl !== player) return
        // rede instável: nem o passo grosso completou, mas algo chegou
        if (!armed) pl.blobs.main.size ? whenDecoded() : fail()
        window.dispatchEvent(new Event('jardim:loaded'))
      })
    }

    const init = async () => {
      try {
        const forced = new URLSearchParams(location.search).get('fmt')
        const [m, e] = await Promise.all([
          fetch('/seq/manifest.json').then((r) => {
            if (!r.ok) throw new Error('manifest ' + r.status)
            return r.json()
          }),
          forced === 'webp' || forced === 'avif'
            ? forced
            : // celular: WebP decodifica bem mais rápido que AVIF 10 bits → frames prontos a tempo
              matchMedia('(pointer: coarse)').matches
              ? 'webp'
              : detectFormat(),
        ])
        if (!alive) return
        manifest = m
        ext = e
        start(pickVariant())
      } catch {
        fail()
      }
    }
    init()

    // No celular, a barra de endereço some/aparece ao rolar e dispara 'resize' só na altura.
    // Isso não pode redimensionar o canvas (a imagem "pularia" e o buffer da GPU seria recriado
    // no meio do scroll): só largura ou orientação contam; a altura é a maior da tela (lvh).
    let lastW = window.innerWidth
    const onResize = () => {
      if (!player) return
      const w = window.innerWidth
      if (coarse && w === lastW) return
      lastW = w
      if (pickVariant() !== state.seq.variant) start(pickVariant())
      else player.resize(...stageSize())
    }
    window.addEventListener('resize', onResize)

    const tick = () => {
      const now = performance.now()
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      // suaviza no espaço do scroll e só então converte em tempo da animação: as pausas
      // e acelerações da TIMELINE continuam suaves
      state.sp = damp(state.sp, state.scroll, coarse ? 14 : 7, dt)
      state.p = animAt(state.sp)
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
      const idle = Math.abs(state.scroll - state.sp) < 0.0004
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
      const torch = { x: (pt.sx * 0.5 + 0.5) * W, y: (-pt.sy * 0.5 + 0.5) * H, amount: torchAmt }
      // saindo do hero: a cena chega de perto (zoom) e assenta enquanto a imagem do hero some
      const heroIn = 1 - smooth(invLerp(0.2, 1, state.hero))
      const zoom = 1 + 0.025 * par + 0.14 * heroIn
      const px = -pt.sx * 10 * par
      const py = pt.sy * 7 * par

      // ---- buquê: giro + híbrido turntable (Blender) / peças (Three.js) ----
      const B = state.bouquet
      B.spinVel *= Math.exp(-dt * 2.5)
      B.spin += B.spinVel * dt
      // em repouso, assenta no ângulo renderizado mais próximo: imagem do Blender nítida,
      // sem crossfade entre ângulos (o crossfade só aparece durante o giro, como motion blur)
      const nTurn = player.src.turn.length
      if (nTurn && !B.dragging && Math.abs(B.spinVel) < 0.05 && B.mode === 'idle') {
        const step = (Math.PI * 2) / nTurn
        const A = bouquetAngle(P)
        B.spin += (Math.round(A / step) * step - A) * (1 - Math.exp(-7 * dt))
      }
      const arrived = P >= 0.93
      let turnTarget = 0
      if (player.turnReady() && P > 0.86) {
        if (!B.threeReady) turnTarget = smooth(invLerp(0.88, 0.93, P)) // sem 3D ainda: o render aparece sozinho
        else if (arrived && B.mode === 'idle' && !B.request && now - (B.idleAt || 0) > 350) turnTarget = 1
      }
      // explodir: troca instantânea para as peças (o movimento esconde a troca)
      if (B.request === 'explode' || B.mode !== 'idle') B.turnAlpha = 0
      else B.turnAlpha = damp(B.turnAlpha, turnTarget, turnTarget > B.turnAlpha ? 5 : 14, dt)
      const nT = player.src.turn.length
      const ang = bouquetAngle(P) / (Math.PI * 2)
      const turnK = (ang - Math.floor(ang)) * nT

      // só redesenha quando algo visível mudou (economia de bateria/GPU)
      const r2 = (v) => Math.round(v * 100)
      const sig = [r2(fs), r2(torch.x / 10), r2(torch.y / 10), r2(torchAmt), r2(zoom * 10), r2(px), r2(py), r2(B.turnAlpha), B.turnAlpha > 0.001 ? r2(turnK) : 0, W, H].join()
      // hero ainda opaco por cima: nada a desenhar
      if (state.hero > 0.25 && player.needsDraw(sig)) {
        player.draw(fs, { zoom, px, py, dir, torch })
        if (B.turnAlpha > 0.001) player.drawTurn(turnK, B.turnAlpha)
      }

      // peças montadas (dados exportados por frame): cada nova peça encaixada "estala"
      const built = m.built[Math.round(fs)] || 0
      if (built > (state.built || 0) && dir > 0 && !idle) snapBurst(built - state.built)
      state.built = built
      updateAmbient(P, smooth(invLerp(0.085, 0.2, P)), Math.abs(state.velocity || 0))

      // etiquetas dos projetos
      const L = m.labels[state.seq.variant]
      const f0 = Math.floor(fs)
      const f1 = Math.min(m.frames - 1, f0 + 1)
      const k = fs - f0
      const els = state.labelEls || []
      const fadeEnd = 1 - smooth(invLerp(0.82, 0.86, P))
      const headerH = W <= 820 ? 96 : 84
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        const a = L[f0]?.[i]
        const b = L[f1]?.[i]
        if (!el || !a || !b) continue
        // só depois que o canteiro do projeto terminou de montar
        const done = m.labelDone?.[i] ?? 0
        const vis = lerp(a[2], b[2], k) * fadeEnd * smooth(invLerp(done, done + 0.012, P)) * smooth(invLerp(0.655, 0.675, state.sp)) // e depois do texto do jardim
        if (vis <= 0.001) {
          setStyle(el, 'opacity', '0')
          setStyle(el, 'pointerEvents', 'none')
          continue
        }
        const [x, y] = player.project(lerp(a[0], b[0], k), lerp(a[1], b[1], k))
        // cartão à esquerda da âncora na metade direita da tela
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
