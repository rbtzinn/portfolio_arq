// Player de sequência de imagens ligado ao scroll, desenhado num <canvas> 2D.
//
// - Carregamento progressivo: primeiro 1 a cada 16 frames, depois 8, 4, 2, 1 — o scroll
//   funciona desde o início usando o frame carregado mais próximo.
// - Os arquivos (AVIF ou WebP) ficam comprimidos na memória; só uma janela em volta do
//   frame atual é decodificada (createImageBitmap, fora da thread principal).
// - Entre dois frames, um crossfade suaviza o scroll lento.
// - "Lanterna": no trecho escuro, a versão iluminada do mesmo frame aparece por uma
//   máscara radial que segue o cursor/giroscópio.

const AVIF_PROBE =
  'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAAD5bWV0YQAAAAAAAAAvaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAFBpY3R1cmVIYW5kbGVyAAAAAA5waXRtAAAAAAABAAAAHmlsb2MAAAAARAAAAQABAAAAAQAAASEAAAAWAAAAKGlpbmYAAAAAAAEAAAAaaW5mZQIAAAAAAQAAYXYwMUNvbG9yAAAAAGppcHJwAAAAS2lwY28AAAAUaXNwZQAAAAAAAAACAAAAAgAAABBwaXhpAAAAAAMICAgAAAAMYXYxQ4EADAAAAAATY29scm5jbHgAAgACAAIAAAAAF2lwbWEAAAAAAAAAAQABBAECgwQAAAAebWRhdAoFGAA2wCAyDRgAAABQAAAAALASmcg='

export function detectFormat() {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img.width > 0 ? 'avif' : 'webp')
    img.onerror = () => resolve('webp')
    img.src = AVIF_PROBE
  })
}

import { GLRenderer } from './gl.js'

const pad = (n) => String(n).padStart(4, '0')
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (t) => t * t * (3 - 2 * t)

export class SequencePlayer {
  constructor(canvas, manifest, variant, ext, base = '/seq/') {
    this.canvas = canvas
    // WebGL quando existe (texturas + shader); canvas 2D só como reserva
    this.glr = GLRenderer.create(canvas)
    this.ctx = this.glr ? null : canvas.getContext('2d', { alpha: false })
    if (this.glr)
      this.glr.onRestore = () => {
        this.bitmaps.clear() // texturas antigas morreram com o contexto
        this.dirty = true
      }
    this.m = manifest
    this.variant = variant
    this.v = manifest.variants[variant]
    this.ext = ext
    this.base = base
    this.src = { main: this.v.main.frames, lit: this.v.lit?.frames || [], turn: this.v.turn?.frames || [] }
    this.blobs = { main: new Map(), lit: new Map(), turn: new Map() }
    this.bitmaps = new Map() // "modo:i" → ImageBitmap (LRU)
    this.decoding = new Set()
    // texturas/bitmaps decodificados mantidos (janela em volta do frame atual)
    this.maxBitmaps = matchMedia('(pointer: coarse)').matches ? 22 : 34
    this.iw = this.v.size[0]
    this.ih = this.v.size[1]
    this.fit = { s: 1, x: 0, y: 0, w: 0, h: 0 }
    this.off = document.createElement('canvas')
    this.offCtx = this.glr ? null : this.off.getContext('2d')
    this.loaded = 0
    this.total = this.src.main.length + this.src.lit.length + this.src.turn.length
    this.aborted = false
  }

  url(mode, i) {
    return `${this.base}${this.v[mode].path}/${pad(i)}.${this.ext}`
  }

  // ordem progressiva: lanterna e passos grossos primeiro
  loadOrder() {
    const order = []
    const seen = new Set()
    const push = (mode, i) => {
      const k = mode + i
      if (!seen.has(k)) {
        seen.add(k)
        order.push([mode, i])
      }
    }
    const n = this.src.main.length
    push('main', 0)
    for (let i = 0; i < this.src.lit.length; i += 4) push('lit', i)
    for (const step of [16, 8, 4, 2, 1]) {
      for (let i = 0; i < n; i += step) push('main', i)
      if (step === 4) for (let i = 0; i < this.src.lit.length; i++) push('lit', i)
    }
    push('main', n - 1)
    // turntable do buquê por último, também do grosso ao fino
    const nt = this.src.turn.length
    for (const step of [8, 4, 2, 1]) for (let i = 0; i < nt; i += step) push('turn', i)
    return order
  }

  async load(onProgress, concurrency = 6) {
    const order = this.loadOrder()
    let next = 0
    const worker = async () => {
      while (next < order.length && !this.aborted) {
        const [mode, i] = order[next++]
        try {
          const res = await fetch(this.url(mode, i))
          if (!res.ok) throw new Error(res.status)
          this.blobs[mode].set(i, await res.blob())
        } catch {
          /* frame ausente: o vizinho carregado cobre */
        }
        this.loaded++
        onProgress?.(this.loaded, order.length)
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
  }

  decode(mode, i) {
    const key = mode + ':' + i
    if (this.bitmaps.has(key)) {
      const b = this.bitmaps.get(key)
      this.bitmaps.delete(key)
      this.bitmaps.set(key, b) // renova no LRU
      return b
    }
    const blob = this.blobs[mode].get(i)
    // no máximo 3 decodificações ao mesmo tempo: as mais próximas pedem primeiro
    if (blob && !this.decoding.has(key) && this.decoding.size < 3) {
      this.decoding.add(key)
      createImageBitmap(blob, { premultiplyAlpha: 'premultiply', imageOrientation: 'none' })
        .then((bmp) => {
          if (this.aborted) return bmp.close?.()
          let entry = bmp
          if (this.glr) {
            entry = this.glr.upload(bmp) // vai para a GPU uma vez
            bmp.close?.()
          }
          this.bitmaps.set(key, entry)
          this.dirty = true // um frame melhor chegou: vale redesenhar
          while (this.bitmaps.size > this.maxBitmaps) {
            const [k, old] = this.bitmaps.entries().next().value
            this.bitmaps.delete(k)
            this.free(old)
          }
        })
        .catch(() => {})
        .finally(() => this.decoding.delete(key))
    }
    return null
  }

  free(entry) {
    if (this.glr) this.glr.release(entry)
    else entry?.close?.()
  }

  // bitmap decodificado mais próximo de i (procura para os dois lados)
  nearest(mode, i) {
    const n = this.src[mode].length
    for (let d = 0; d < n; d++) {
      for (const j of d ? [i - d, i + d] : [i]) {
        if (j < 0 || j >= n) continue
        const b = this.bitmaps.get(mode + ':' + j)
        if (b) return b
        if (d < 3) this.decode(mode, j)
      }
    }
    return null
  }

  // posição fracionária na lista de frames disponíveis
  locate(mode, fs) {
    const s = this.src[mode]
    if (!s.length) return null
    if (fs <= s[0]) return [0, 0, 0]
    const last = s.length - 1
    if (fs >= s[last]) return [last, last, 0]
    let lo = 0
    let hi = last
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (s[mid] <= fs) lo = mid
      else hi = mid
    }
    return [lo, hi, (fs - s[lo]) / (s[hi] - s[lo])]
  }

  // Pula o desenho se nada mudou desde o último quadro (economia de bateria/GPU).
  needsDraw(sig) {
    if (sig === this.lastSig && !this.dirty) return false
    this.lastSig = sig
    this.dirty = false
    return true
  }

  resize(w, h, dpr) {
    this.dirty = true
    const r = Math.min(dpr, 2, Math.max(1, (this.iw * 1.25) / w))
    this.canvas.width = Math.round(w * r)
    this.canvas.height = Math.round(h * r)
    this.canvas.style.width = w + 'px'
    this.canvas.style.height = h + 'px'
    if (!this.glr) {
      this.off.width = this.canvas.width
      this.off.height = this.canvas.height
    }
    this.cssW = w
    this.cssH = h
    this.ratio = r
  }

  // enquadramento "cover" com zoom/paralaxe opcionais (em px de CSS)
  computeFit(zoom = 1, px = 0, py = 0) {
    const s = Math.max(this.cssW / this.iw, this.cssH / this.ih) * zoom
    const w = this.iw * s
    const h = this.ih * s
    this.fit = { s, w, h, x: (this.cssW - w) / 2 + px, y: (this.cssH - h) / 2 + py }
    return this.fit
  }

  drawBitmap(ctx, bmp, alpha = 1) {
    if (!bmp) return
    const r = this.ratio
    const f = this.fit
    ctx.globalAlpha = alpha
    ctx.drawImage(bmp, f.x * r, f.y * r, f.w * r, f.h * r)
    ctx.globalAlpha = 1
  }

  // fs = frame de origem fracionário; torch = { x, y (px CSS), amount }
  draw(fs, { zoom = 1, px = 0, py = 0, torch = null, dir = 1 } = {}) {
    const ctx = this.ctx
    this.computeFit(zoom, px, py)
    const loc = this.locate('main', fs)
    if (!loc) return
    const [a, b, t] = loc
    const A = this.decode('main', a) || this.nearest('main', a)
    const B = t > 0.02 ? this.decode('main', b) : null
    if (this.glr) return this.drawGL(fs, A, B, t, torch, dir, a)
    this.drawBitmap(ctx, A)
    // crossfade curto no meio do intervalo: menos tempo em dupla exposição
    if (B && B !== A) this.drawBitmap(ctx, B, smooth(clamp((t - 0.2) / 0.6)))

    // pré-decodifica à frente na direção do scroll
    for (let k = 1; k <= 6; k++) this.decode('main', clamp(a + k * dir, 0, this.src.main.length - 1) | 0)
    this.decode('main', clamp(a - dir, 0, this.src.main.length - 1) | 0)

    if (torch && torch.amount > 0.001 && this.src.lit.length) {
      const l = this.locate('lit', Math.min(fs, this.src.lit[this.src.lit.length - 1]))
      const LA = this.decode('lit', l[0]) || this.nearest('lit', l[0])
      const LB = l[2] > 0.02 ? this.decode('lit', l[1]) : null
      if (LA) {
        const o = this.offCtx
        const r = this.ratio
        o.globalCompositeOperation = 'source-over'
        o.clearRect(0, 0, this.off.width, this.off.height)
        this.drawBitmap(o, LA)
        if (LB && LB !== LA) this.drawBitmap(o, LB, l[2])
        o.globalCompositeOperation = 'destination-in'
        const R = Math.max(this.cssW, this.cssH) * 0.34 * r
        const g = o.createRadialGradient(torch.x * r, torch.y * r, 0, torch.x * r, torch.y * r, R)
        g.addColorStop(0, 'rgba(0,0,0,1)')
        g.addColorStop(0.35, 'rgba(0,0,0,0.9)')
        g.addColorStop(0.7, 'rgba(0,0,0,0.3)')
        g.addColorStop(1, 'rgba(0,0,0,0.05)')
        o.fillStyle = g
        o.fillRect(0, 0, this.off.width, this.off.height)
        ctx.globalAlpha = torch.amount
        ctx.drawImage(this.off, 0, 0)
        ctx.globalAlpha = 1
      }
    }
  }

  drawGL(fs, A, B, t, torch, dir, a) {
    this.prefetch(a, dir)
    if (!A) return
    const r = this.ratio
    const f = this.fit
    let LA = null
    let LB = null
    let lt = 0
    if (torch && torch.amount > 0.001 && this.src.lit.length) {
      const l = this.locate('lit', Math.min(fs, this.src.lit[this.src.lit.length - 1]))
      LA = this.decode('lit', l[0]) || this.nearest('lit', l[0])
      LB = l[2] > 0.02 ? this.decode('lit', l[1]) : null
      lt = l[2]
    }
    this.glr.drawMain({
      A,
      B: B && B !== A ? B : null,
      t: smooth(clamp((t - 0.2) / 0.6)),
      LA,
      LB,
      lt,
      torch: torch && { x: torch.x * r, y: torch.y * r, r: Math.max(this.cssW, this.cssH) * 0.34 * r, amount: torch.amount },
      rect: [f.x * r, f.y * r, f.w * r, f.h * r],
    })
  }

  prefetch(a, dir) {
    const n = this.src.main.length
    for (let k = 1; k <= 6; k++) this.decode('main', clamp(a + k * dir, 0, n - 1) | 0)
    this.decode('main', clamp(a - dir, 0, n - 1) | 0)
  }

  // Turntable do buquê: k = índice fracionário do ângulo (0..n, dá a volta).
  // Desenha no retângulo de recorte exportado, com crossfade entre ângulos vizinhos.
  drawTurn(k, alpha = 1) {
    const n = this.src.turn.length
    if (!n || alpha <= 0.001) return false
    const i0 = ((Math.floor(k) % n) + n) % n
    const i1 = (i0 + 1) % n
    const t = k - Math.floor(k)
    const A = this.decode('turn', i0) || this.nearestTurn(i0)
    if (!A) return false
    const B = t > 0.02 ? this.decode('turn', i1) : null
    for (let d = 1; d <= 4; d++) this.decode('turn', (i0 + d) % n)
    const [x0, y0, x1, y1] = this.v.turn.crop
    const [rw, rh] = this.v.turn.res
    const f = this.fit
    const r = this.ratio
    const X = (f.x + (x0 / rw) * f.w) * r
    const Y = (f.y + (y0 / rh) * f.h) * r
    const Wd = ((x1 - x0) / rw) * f.w * r
    const Hd = ((y1 - y0) / rh) * f.h * r
    if (this.glr) {
      this.glr.drawTurn({ A, B: B && B !== A ? B : null, t, alpha, rect: [X, Y, Wd, Hd] })
      return true
    }
    const ctx = this.ctx
    ctx.globalAlpha = alpha
    ctx.drawImage(A, X, Y, Wd, Hd)
    if (B && B !== A) {
      // os dois ângulos têm alfa: mistura A→B sem "vazar" o fundo no meio do crossfade
      ctx.globalAlpha = alpha * t
      ctx.drawImage(B, X, Y, Wd, Hd)
    }
    ctx.globalAlpha = 1
    return true
  }

  nearestTurn(i) {
    const n = this.src.turn.length
    for (let d = 1; d < n / 2; d++) {
      for (const j of [(i - d + n) % n, (i + d) % n]) {
        const b = this.bitmaps.get('turn:' + j)
        if (b) return b
        if (d < 3) this.decode('turn', j)
      }
    }
    return null
  }

  // turntable utilizável: existe e o passo grosso (1 a cada 8 ângulos) já chegou
  turnReady() {
    const n = this.src.turn.length
    return n > 0 && this.blobs.turn.size >= Math.ceil(n / 8)
  }

  // coordenada normalizada do quadro renderizado → px de CSS na tela
  project(nx, ny) {
    const f = this.fit
    return [f.x + nx * f.w, f.y + ny * f.h]
  }

  dispose() {
    this.aborted = true
    for (const b of this.bitmaps.values()) this.free(b)
    this.bitmaps.clear()
  }
}

export { smooth, clamp }
