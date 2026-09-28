import { state } from '../store.js'

// "Clique" de encaixe sintetizado: ruído curto filtrado + um tom que cai.
// Nenhum arquivo de áudio.
let ctx = null
let master = null
let noiseBuf = null
let last = 0

function ensure() {
  if (ctx) return ctx
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.5
  master.connect(ctx.destination)
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate)
  const d = noiseBuf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3)
  return ctx
}

export function enableSound(on) {
  setSound(on)
}

export function click({ pitch = 1, gain = 0.6 } = {}) {
  if (!state.sound || !ctx) return
  const now = ctx.currentTime
  if (now - last < 0.028) return
  last = now
  const src = ctx.createBufferSource()
  src.buffer = noiseBuf
  src.playbackRate.value = 0.8 + pitch * 0.5
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2600 * pitch + Math.random() * 600
  bp.Q.value = 3
  const g = ctx.createGain()
  g.gain.setValueAtTime(gain * (0.7 + Math.random() * 0.3), now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.06)
  src.connect(bp).connect(g).connect(master)
  src.start(now)

  const o = ctx.createOscillator()
  const og = ctx.createGain()
  o.type = 'triangle'
  o.frequency.setValueAtTime(900 * pitch, now)
  o.frequency.exponentialRampToValueAtTime(220 * pitch, now + 0.05)
  og.gain.setValueAtTime(gain * 0.25, now)
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
  o.connect(og).connect(master)
  o.start(now)
  o.stop(now + 0.08)
}

// Chuva de peças (explosão): vários cliques espalhados no tempo.
export function scatterSound(n = 18) {
  if (!state.sound || !ctx) return
  for (let i = 0; i < n; i++) {
    setTimeout(() => {
      last = 0
      click({ pitch: 0.6 + Math.random() * 0.9, gain: 0.25 + Math.random() * 0.35 })
    }, 120 + Math.random() * 900)
  }
}

/* ------------------------------------------------------------------ */
/* ambiência: um acorde sintetizado que acompanha a narrativa          */
/* ------------------------------------------------------------------ */

// Hz por capítulo: drone no escuro → quinta no caule → maior na flor →
// sexta/nona no jardim → resolução no buquê
const CHORDS = [
  { at: 0.0, f: [55, 82.41, 110, 164.81] },
  { at: 0.12, f: [110, 164.81, 220, 246.94] },
  { at: 0.3, f: [220, 277.18, 329.63, 440] },
  { at: 0.5, f: [185, 220, 277.18, 329.63] },
  { at: 0.86, f: [146.83, 220, 277.18, 369.99] },
]
let amb = null
let chordIdx = -1

function startAmbient() {
  if (amb || !ctx) return
  const out = ctx.createGain()
  out.gain.value = 0
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 400
  lp.Q.value = 0.6
  lp.connect(out).connect(master)
  const oscs = CHORDS[0].f.map((f, i) => {
    const o = ctx.createOscillator()
    o.type = i % 2 ? 'triangle' : 'sine'
    o.frequency.value = f
    o.detune.value = (i - 1.5) * 4
    const g = ctx.createGain()
    g.gain.value = 0.22 / (1 + i * 0.35)
    // respiração lenta, defasada por voz
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.05 + i * 0.023
    const lg = ctx.createGain()
    lg.gain.value = 0.06
    lfo.connect(lg).connect(g.gain)
    lfo.start()
    o.connect(g).connect(lp)
    o.start()
    return o
  })
  // "ar" da estufa: ruído suave filtrado
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const d = nb.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  const air = ctx.createBufferSource()
  air.buffer = nb
  air.loop = true
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 900
  bp.Q.value = 0.4
  const ag = ctx.createGain()
  ag.gain.value = 0.015
  air.connect(bp).connect(ag).connect(out)
  air.start()
  amb = { out, lp, oscs, ag }
  out.gain.setTargetAtTime(0.16, ctx.currentTime, 1.5)
}

export function updateAmbient(P, light, speed = 0) {
  if (!amb || !state.sound) return
  const now = ctx.currentTime
  let i = 0
  while (i < CHORDS.length - 1 && P >= CHORDS[i + 1].at) i++
  if (i !== chordIdx) {
    chordIdx = i
    CHORDS[i].f.forEach((f, k) => amb.oscs[k].frequency.setTargetAtTime(f, now, 0.9))
  }
  // a luz abre o filtro; o scroll rápido dá um leve "sopro"
  amb.lp.frequency.setTargetAtTime(320 + light * 1500 + Math.min(900, speed * 400), now, 0.25)
  amb.ag.gain.setTargetAtTime(0.012 + Math.min(0.03, speed * 0.01), now, 0.3)
}

function stopAmbient() {
  if (!amb) return
  amb.out.gain.setTargetAtTime(0, ctx.currentTime, 0.3)
}

// liga/desliga som + ambiência (precisa de um gesto do usuário na primeira vez)
export function setSound(on) {
  state.sound = on
  if (on) {
    ensure()?.resume()
    startAmbient()
    amb?.out.gain.setTargetAtTime(0.16, ctx.currentTime, 1.2)
  } else stopAmbient()
}

// vários encaixes de uma vez (peças montadas entre dois frames)
let burstAt = 0
export function snapBurst(n) {
  if (!state.sound || !ctx || n <= 0) return
  const now = performance.now()
  if (now - burstAt < 60) return
  burstAt = now
  const k = Math.min(3, n)
  for (let i = 0; i < k; i++) setTimeout(() => click({ pitch: 0.8 + Math.random() * 0.7, gain: 0.35 + Math.random() * 0.2 }), i * 38)
}

// háptica (onde existe: Android)
export function haptic(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* sem suporte */
  }
}
