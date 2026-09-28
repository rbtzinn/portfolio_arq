// Detecção simples de dispositivo (toque / tela estreita): ajusta DPR e sombras do buquê.
const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const narrow = typeof window !== 'undefined' && window.innerWidth < 820

export const isMobile = coarse || narrow
