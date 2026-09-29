// Estado global mutável, lido a cada frame (sem re-render do React).
// `scroll` é a posição do scroll na experiência (0..1); `p` é o tempo da animação (0..1)
// (ver TIMELINE).

export const state = {
  scroll: 0, // 0..1 vindo do ScrollTrigger (bruto)
  sp: 0, // scroll suavizado: textos e interface
  progress: 0, // tempo da animação no scroll bruto
  p: 0, // tempo da animação suavizado: usado pela cena
  hero: 0, // 0 no topo (hero visível) → 1 quando a experiência começa
  velocity: 0,
  pointer: { x: 0, y: 0, sx: 0, sy: 0 }, // -1..1 (s* = suavizado)
  gyro: { enabled: false, x: 0, y: 0 },
  assembled: 0, // peças encaixadas (contador do manual)
  totalPieces: 0,
  sound: false,
  bouquet: {
    mode: 'idle', // idle | exploded | returning
    changedAt: 0,
    idleAt: 0,
    spin: 0,
    spinVel: 0,
    dragging: false,
    turnAlpha: 0, // 1 = turntable renderizado no Blender; 0 = peças em Three.js
    threeReady: false,
  },
  ready: false,
}

// Explode / remonta o buquê (clique, toque ou chacoalhar). A cena 3D consome o pedido.
export function toggleBouquet() {
  const b = state.bouquet
  b.request = b.mode === 'idle' ? 'explode' : 'return'
}

// Ângulo do buquê: giro contínuo + arraste + um toque do scroll. Usado pelo turntable
// (frames do Blender) e pelas peças em Three.js — os dois precisam concordar.
export const bouquetAngle = (P) => state.bouquet.spin + P * 3

// Fases da coreografia no tempo da animação (usadas por bricks/world.js para montar a cena).
export const CH = {
  void: [0.0, 0.1],
  stem: [0.1, 0.3],
  bloom: [0.3, 0.48],
  reveal: [0.48, 0.58],
  garden: [0.58, 0.84],
  bouquet: [0.84, 1.0],
}

// Scroll → tempo da animação: direto (1:1), sem pausas nem câmera lenta — a animação
// sempre acompanha o dedo. Os textos só entram quando cada montagem fica completa.
export const TIMELINE = [
  [0, 0],
  [1, 1],
]
export function animAt(s) {
  if (s <= 0) return 0
  for (let i = 1; i < TIMELINE.length; i++) {
    const [s1, p1] = TIMELINE[i]
    if (s <= s1) {
      const [s0, p0] = TIMELINE[i - 1]
      return p0 + (p1 - p0) * ((s - s0) / (s1 - s0))
    }
  }
  return 1
}

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const invLerp = (a, b, v) => clamp((v - a) / (b - a))
export const smooth = (t) => t * t * (3 - 2 * t)
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)
export const easeOutBack = (t, s = 1.70158) => {
  const c3 = s + 1
  return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2)
}
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt))

// PRNG determinístico para que o jardim seja sempre o mesmo.
export function rng(seed = 1) {
  let s = seed >>> 0
  return () => {
    s += 0x6d2b79f5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
