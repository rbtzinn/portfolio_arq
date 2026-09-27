// Estado global mutável, lido a cada frame (sem re-render do React).
// Tudo que é "ligado ao scroll" lê `progress` (bruto) ou `p` (suavizado).

export const state = {
  progress: 0, // 0..1 vindo do ScrollTrigger
  p: 0, // progresso suavizado usado pela cena
  velocity: 0,
  pointer: { x: 0, y: 0, sx: 0, sy: 0 }, // -1..1 (s* = suavizado)
  gyro: { enabled: false, x: 0, y: 0 },
  assembled: 0, // peças encaixadas (contador do manual)
  totalPieces: 0,
  sound: false,
  bouquet: {
    mode: 'idle', // idle | exploded | returning
    changedAt: 0,
    spin: 0,
    spinVel: 0,
    dragging: false,
  },
  ready: false,
}

// Capítulos da narrativa em faixas de progresso.
export const CH = {
  void: [0.0, 0.1],
  stem: [0.1, 0.3],
  bloom: [0.3, 0.48],
  reveal: [0.48, 0.58],
  garden: [0.58, 0.84],
  bouquet: [0.84, 1.0],
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
