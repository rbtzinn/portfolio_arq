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
  state.sound = on
  if (on) ensure()?.resume()
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
