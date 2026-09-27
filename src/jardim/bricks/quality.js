// Detecção de tier de qualidade. O PerformanceMonitor pode rebaixar em tempo real.

const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const narrow = typeof window !== 'undefined' && window.innerWidth < 820
const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4
const mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4
const forced = typeof location !== 'undefined' && new URLSearchParams(location.search).get('q')

export const isMobile = coarse || narrow

function detect() {
  if (forced && ['high', 'mid', 'low'].includes(forced)) return forced
  if (isMobile) return cores >= 6 && mem >= 4 ? 'mid' : 'low'
  return cores >= 4 ? 'high' : 'mid'
}

export const TIERS = {
  high: { dpr: [1, 1.75], post: true, dof: true, shadow: 2048, flowers: 130, seg: 24, bed: 1 },
  mid: { dpr: [1, 1.5], post: true, dof: false, shadow: 1024, flowers: 70, seg: 18, bed: 0.75 },
  low: { dpr: [0.8, 1.25], post: false, dof: false, shadow: 512, flowers: 44, seg: 14, bed: 0.6 },
}

export const initialTier = detect()
