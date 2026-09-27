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

const pad = (n) => String(n).padStart(4, '0')
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (t) => t * t * (3 - 2 * t)

export class SequencePlayer {
  constructor(canvas, manifest, variant, ext, base = '/seq/') {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false })
    this.m = manifest
    this.variant = variant
    this.v = manifest.variants[variant]
    this.ext = ext
    this.base = base
    this.src = { main: this.v.main.frames, lit: this.v.lit?.frames || [] }
    this.blobs = { main: new Map(), lit: new Map() }
    this.bitmaps = new Map() // "modo:i" → ImageBitmap (LRU)
    this.decoding = new Set()
    this.maxBitmaps = 26
    this.iw = this.v.size[0]
    this.ih = this.v.size[1]
    this.fit = { s: 1, x: 0, y: 0, w: 0, h: 0 }
    this.off = document.createElement('canvas')
    this.offCtx = this.off.getContext('2d')
    this.loaded = 0
    this.total = this.src.main.length + this.src.lit.length
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
    if (blob && !this.decoding.has(key)) {
      this.decoding.add(key)
      createImageBitmap(blob)
        .then((bmp) => {
          this.bitmaps.set(key, bmp)
          while (this.bitmaps.size > this.maxBitmaps) {
            const [k, old] = this.bitmaps.entries().next().value
            this.bitmaps.delete(k)
            old.close?.()
          }
        })
        .catch(() => {})
        .finally(() => this.decoding.delete(key))
    }
    return null
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

  resize(w, h, dpr) {
    const r = Math.min(dpr, 2, Math.max(1, (this.iw * 1.25) / w))
    this.canvas.width = Math.round(w * r)
    this.canvas.height = Math.round(h * r)
    this.canvas.style.width = w + 'px'
    this.canvas.style.height = h + 'px'
    this.off.width = this.canvas.width
    this.off.height = this.canvas.height
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
    this.drawBitmap(ctx, A)
    if (B && B !== A) this.drawBitmap(ctx, B, t)

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

  // coordenada normalizada do quadro renderizado → px de CSS na tela
  project(nx, ny) {
    const f = this.fit
    return [f.x + nx * f.w, f.y + ny * f.h]
  }

  dispose() {
    this.aborted = true
    for (const b of this.bitmaps.values()) b.close?.()
    this.bitmaps.clear()
  }
}

export { smooth, clamp }
