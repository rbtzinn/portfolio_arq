// Player da animação renderizada no Blender, ligado ao scroll e desenhado em WebGL.
//
// - Sequência principal: um vídeo H.264 curto (decodificado pelo hardware do aparelho),
//   mostrado como o próprio <video> na página — o navegador compõe o quadro direto na GPU,
//   sem cópia para textura nem shader em tela cheia. O scroll só muda o currentTime e o
//   enquadramento (zoom/paralaxe) é um transform de CSS.
// - O canvas por cima fica transparente e só desenha quando precisa: lanterna no começo e
//   turntable do buquê no fim.
// - O vídeo é baixado inteiro antes (blob local): buscar um quadro é instantâneo, inclusive
//   no Safari, que não busca bem em vídeo por streaming.
// - Imagens (AVIF ou WebP) só onde o vídeo não serve: a versão iluminada da lanterna
//   (máscara radial que segue o ponteiro) e o turntable do buquê (com alfa).

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
import { PlayDriver } from './playdrive.js'

const pad = (n) => String(n).padStart(4, '0')
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const smooth = (t) => t * t * (3 - 2 * t)

export class SequencePlayer {
  constructor(canvas, manifest, variant, ext, base = '/seq/') {
    this.canvas = canvas
    const videoMode = !!manifest.variants[variant].main.video
    // WebGL quando existe (texturas + shader); canvas 2D só como reserva.
    // Com vídeo, o canvas é uma camada transparente por cima dele.
    this.glr = GLRenderer.create(canvas, videoMode)
    this.ctx = this.glr ? null : canvas.getContext('2d', { alpha: videoMode })
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
    this.uploads = new Map() // decodificados aguardando envio à GPU
    this.uploadBudget = 1
    // texturas/bitmaps decodificados mantidos (janela em volta do frame atual)
    this.maxBitmaps = matchMedia('(pointer: coarse)').matches ? 22 : 34
    this.ahead = 10 // frames pré-carregados à frente na direção da rolagem
    this.iw = this.v.size[0]
    this.ih = this.v.size[1]
    this.fit = { s: 1, x: 0, y: 0, w: 0, h: 0 }
    this.off = document.createElement('canvas')
    this.offCtx = this.glr ? null : this.off.getContext('2d')
    this.loaded = 0
    this.total = this.src.main.length + this.src.lit.length + this.src.turn.length
    this.aborted = false
    // sequência principal em vídeo (manifest novo); sem ele, frames de imagem como antes
    this.fps = this.v.main.fps || 30
    this.video = videoMode ? this.makeVideo() : null
    // celular: rolagem por reprodução (vídeo normal + cópia invertida; ver playdrive.js).
    // ?vmode=seek | play força um dos modos (testes)
    const vmode = new URLSearchParams(location.search).get('vmode')
    const touch = matchMedia('(pointer: coarse)').matches
    this.playMode = videoMode && !!this.v.main.videoRev && vmode !== 'seek' && (touch || vmode === 'play')
    this.vFwd = this.video
    this.vRev = this.playMode ? this.makeVideo(true) : null
    this.driver = null
    this.videoXf = ''
    this.overlayEmpty = true
    this.shown = -1
    this.want = 0
    this.seeking = false
    this.videoReady = false
  }

  makeVideo(hidden = false) {
    const v = document.createElement('video')
    v.muted = true
    v.playsInline = true
    v.preload = 'auto'
    v.setAttribute('playsinline', '')
    v.setAttribute('aria-hidden', 'true')
    v.disablePictureInPicture = true
    v.className = 'seq-video'
    v.width = this.v.size[0]
    v.height = this.v.size[1]
    // atrás do canvas, no mesmo palco; tamanho nativo + transform (só compositor)
    this.canvas.parentElement.insertBefore(v, this.canvas)
    v.style.opacity = '0' // aparece com o primeiro quadro
    if (!hidden) v.addEventListener('seeked', () => this.onSeeked())
    return v
  }

  // baixa o vídeo inteiro (com progresso) e deixa o primeiro quadro pronto
  async loadVideo(onProgress) {
    // H.264 (decodificação por hardware em tudo, inclusive iPhone); VP9 onde não houver H.264
    const h264 = this.video.canPlayType('video/mp4; codecs="avc1.640028"')
    const file = !h264 && this.v.main.videoAlt ? this.v.main.videoAlt : this.v.main.video
    const res = await fetch(this.base + file)
    if (!res.ok) throw new Error(res.status)
    const total = +res.headers.get('content-length') || 0
    let blob
    if (res.body && total) {
      const reader = res.body.getReader()
      const parts = []
      let got = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done || this.aborted) break
        parts.push(value)
        got += value.length
        onProgress?.(got / total)
      }
      blob = new Blob(parts, { type: file.endsWith('.webm') ? 'video/webm' : 'video/mp4' })
    } else blob = await res.blob()
    if (this.aborted) return
    const v = this.video
    this.videoUrl = URL.createObjectURL(blob)
    await new Promise((ok, err) => {
      v.addEventListener('loadeddata', ok, { once: true })
      v.addEventListener('error', () => err(new Error('video')), { once: true })
      v.src = this.videoUrl
      v.load()
    })
    this.videoReady = true
    await new Promise((ok) => {
      this.onFirst = ok
      this.seek(this.want, true)
    })
    // modo reprodução só com H.264 (a cópia invertida existe só nesse formato)
    if (this.playMode && h264 && !this.aborted) {
      this.driver = new PlayDriver(this.vFwd, this.vRev, this.src.main.length, this.fps)
      this.loadReverse() // em segundo plano: até chegar, voltar usa busca
    } else this.playMode = false
  }

  async loadReverse() {
    try {
      const res = await fetch(this.base + this.v.main.videoRev)
      if (!res.ok) return
      const blob = await res.blob()
      if (this.aborted) return
      this.revUrl = URL.createObjectURL(blob)
      const v = this.vRev
      await new Promise((ok, err) => {
        v.addEventListener('loadeddata', ok, { once: true })
        v.addEventListener('error', err, { once: true })
        v.src = this.revUrl
        v.load()
      })
      if (!this.aborted) this.driver.revReady = true
    } catch {
      /* sem a cópia invertida: voltar continua funcionando por busca */
    }
  }

  // pede o quadro i do vídeo; um pedido por vez (o último pedido vence)
  seek(i, force = false) {
    this.want = i
    if (!this.videoReady || this.seeking || (i === this.shown && !force)) return
    this.seeking = true
    this.pending = i
    this.video.currentTime = (i + 0.5) / this.fps
  }

  onSeeked() {
    if (this.aborted) return
    this.seeking = false
    this.shown = this.pending
    if (this.onFirst) {
      this.video.style.opacity = ''
      this.onFirst()
      this.onFirst = null
    }
    if (!this.driver && this.want !== this.shown) this.seek(this.want)
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
    const n = this.video ? 0 : this.src.main.length
    if (n) push('main', 0)
    for (let i = 0; i < this.src.lit.length; i += 4) push('lit', i)
    for (const step of [16, 8, 4, 2, 1]) {
      for (let i = 0; i < n; i += step) push('main', i)
      if (step === 4) for (let i = 0; i < this.src.lit.length; i++) push('lit', i)
    }
    if (n) push('main', n - 1)
    // turntable do buquê por último, também do grosso ao fino
    const nt = this.src.turn.length
    for (const step of [8, 4, 2, 1]) for (let i = 0; i < nt; i += step) push('turn', i)
    return order
  }

  async load(onProgress, concurrency = 6) {
    const order = this.loadOrder()
    // com vídeo: o vídeo pesa ~80% do progresso e chega primeiro (é o que libera a tela)
    const imgs = order.length || 1
    if (this.video) {
      await this.loadVideo((f) => onProgress?.(f * 0.8))
      if (this.aborted) return
      this.onVideoReady?.()
    }
    const report = () => onProgress?.(this.video ? 0.8 + 0.2 * (this.loaded / imgs) : this.loaded / imgs)
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
        report()
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker))
  }

  decode(mode, i, urgent = false) {
    const key = mode + ':' + i
    if (this.bitmaps.has(key)) {
      const b = this.bitmaps.get(key)
      this.bitmaps.delete(key)
      this.bitmaps.set(key, b) // renova no LRU
      return b
    }
    // decodificado, esperando a vez de ir para a GPU: o frame da tela sobe na hora,
    // os de pré-carga no máximo um por quadro (vários envios num quadro = travada)
    const ready = this.uploads.get(key)
    if (ready) {
      if (!urgent && this.uploadBudget <= 0) return null
      if (!urgent) this.uploadBudget--
      this.uploads.delete(key)
      return this.store(key, this.glr.upload(ready), ready)
    }
    const blob = this.blobs[mode].get(i)
    // no máximo 3 decodificações ao mesmo tempo: as mais próximas pedem primeiro
    if (blob && !this.decoding.has(key) && this.decoding.size < 3 && this.uploads.size < 8) {
      this.decoding.add(key)
      createImageBitmap(blob, { premultiplyAlpha: 'premultiply', imageOrientation: 'none' })
        .then((bmp) => {
          if (this.aborted) return bmp.close?.()
          this.dirty = true // um frame melhor chegou: vale redesenhar
          if (this.glr) {
            this.uploads.set(key, bmp) // sobe para a GPU no próximo quadro, com orçamento
            return
          }
          this.store(key, bmp)
        })
        .catch(() => {})
        .finally(() => this.decoding.delete(key))
    }
    return null
  }

  store(key, entry, bmp) {
    bmp?.close?.()
    this.bitmaps.set(key, entry)
    while (this.bitmaps.size > this.maxBitmaps) {
      const [k, old] = this.bitmaps.entries().next().value
      this.bitmaps.delete(k)
      this.free(old)
    }
    return entry
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
    this.uploadBudget = 1
    if (this.video) return this.drawVideo(fs, a, b, t, torch)
    const A = this.decode('main', a, true) || this.nearest('main', a)
    const B = t > 0.02 ? this.decode('main', b, true) : null
    if (this.glr) return this.drawGL(fs, A, B, t, torch, dir, a)
    this.drawBitmap(ctx, A)
    // crossfade curto no meio do intervalo: menos tempo em dupla exposição
    if (B && B !== A) this.drawBitmap(ctx, B, t /* frames com motion blur: crossfade linear e contínuo */)

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

  drawVideo(fs, a, b, t, torch) {
    if (this.driver && !this.onFirst) {
      // reprodução: toca (para frente ou a cópia invertida) até alcançar o quadro do dedo
      if (this.driver.drive(a + t)) this.dirty = true // continua conduzindo no próximo quadro
      this.video = this.driver.active
      this.want = Math.round(a + t)
      this.shown = this.driver.frameOf(this.video)
    } else this.seek(t < 0.5 ? a : b)
    // enquadramento "cover" + zoom/paralaxe: transform no próprio vídeo (nas duas cópias)
    const f = this.fit
    const xf = `translate3d(${f.x.toFixed(1)}px, ${f.y.toFixed(1)}px, 0) scale(${f.s.toFixed(5)})`
    if (xf !== this.videoXf) {
      this.videoXf = xf
      this.vFwd.style.transform = xf
      if (this.vRev) this.vRev.style.transform = xf
    }
    this.frameCleared = false
    const lit = torch && torch.amount > 0.001 && this.src.lit.length && this.glr
    if (lit) {
      const r = this.ratio
      const l = this.locate('lit', Math.min(fs, this.src.lit[this.src.lit.length - 1]))
      const LA = this.decode('lit', l[0], true) || this.nearest('lit', l[0])
      const LB = l[2] > 0.02 ? this.decode('lit', l[1], true) : null
      if (LA) {
        this.clearOverlay()
        this.glr.drawTorch({
          LA,
          LB: LB && LB !== LA ? LB : null,
          lt: l[2],
          torch: { x: torch.x * r, y: torch.y * r, r: Math.max(this.cssW, this.cssH) * 0.34 * r, amount: torch.amount },
          rect: [f.x * r, f.y * r, f.w * r, f.h * r],
        })
        this.overlayEmpty = false
        return
      }
    }
    // nada por cima: limpa uma vez e deixa o canvas parado (transparente)
    if (!this.overlayEmpty) {
      this.clearOverlay()
      this.overlayEmpty = true
    }
  }

  clearOverlay() {
    if (this.glr) this.glr.clear()
    else this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.frameCleared = true
  }

  // pixels do que está na tela (testes): o quadro do vídeo com o mesmo enquadramento
  sample(x, y, w, h) {
    const c = (this.sampleCanvas ||= document.createElement('canvas'))
    c.width = this.canvas.width
    c.height = this.canvas.height
    const ctx = c.getContext('2d', { willReadFrequently: true })
    const r = this.ratio
    const f = this.fit
    if (this.video) ctx.drawImage(this.video, f.x * r, f.y * r, f.w * r, f.h * r)
    ctx.drawImage(this.canvas, 0, 0)
    return ctx.getImageData(x, y, w, h).data
  }

  drawGL(fs, A, B, t, torch, dir, a) {
    if (a >= 0) this.prefetch(a, dir)
    if (!A) return
    const r = this.ratio
    const f = this.fit
    let LA = null
    let LB = null
    let lt = 0
    if (torch && torch.amount > 0.001 && this.src.lit.length) {
      const l = this.locate('lit', Math.min(fs, this.src.lit[this.src.lit.length - 1]))
      LA = this.decode('lit', l[0], true) || this.nearest('lit', l[0])
      LB = l[2] > 0.02 ? this.decode('lit', l[1], true) : null
      lt = l[2]
    }
    this.glr.drawMain({
      A,
      B: B && B !== A ? B : null,
      t: t /* frames com motion blur: crossfade linear e contínuo */,
      LA,
      LB,
      lt,
      torch: torch && { x: torch.x * r, y: torch.y * r, r: Math.max(this.cssW, this.cssH) * 0.34 * r, amount: torch.amount },
      rect: [f.x * r, f.y * r, f.w * r, f.h * r],
    })
  }

  prefetch(a, dir) {
    const n = this.src.main.length
    for (let k = 1; k <= this.ahead; k++) this.decode('main', clamp(a + k * dir, 0, n - 1) | 0)
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
    const A = this.decode('turn', i0, true) || this.nearestTurn(i0)
    if (!A) return false
    const B = t > 0.02 ? this.decode('turn', i1, true) : null
    for (let d = 1; d <= 4; d++) this.decode('turn', (i0 + d) % n)
    const [x0, y0, x1, y1] = this.v.turn.crop
    const [rw, rh] = this.v.turn.res
    const f = this.fit
    const r = this.ratio
    const X = (f.x + (x0 / rw) * f.w) * r
    const Y = (f.y + (y0 / rh) * f.h) * r
    const Wd = ((x1 - x0) / rw) * f.w * r
    const Hd = ((y1 - y0) / rh) * f.h * r
    if (this.video && !this.frameCleared) this.clearOverlay()
    this.overlayEmpty = false
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
    for (const b of this.uploads.values()) b.close?.()
    this.uploads.clear()
    for (const b of this.bitmaps.values()) this.free(b)
    this.bitmaps.clear()
    for (const v of [this.vFwd, this.vRev]) {
      if (!v) continue
      v.pause()
      v.removeAttribute('src')
      v.load()
      v.remove()
    }
    if (this.videoUrl) URL.revokeObjectURL(this.videoUrl)
    if (this.revUrl) URL.revokeObjectURL(this.revUrl)
  }
}

export { smooth, clamp }
