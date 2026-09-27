import * as THREE from 'three'
import { C } from './material.js'
import { PLATE, BRICK } from './geometry.js'

// Cada flor vira uma lista de peças reais: { type, color, matrix, role }.
// A origem da flor é a base do caule, no chão.

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _v = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

class Builder {
  constructor() {
    this.parts = []
  }
  add(type, color, matrix, role = 'stem') {
    this.parts.push({ type, color, matrix: matrix.clone(), role, order: this.parts.length })
    return this
  }
}

const rot = (x, y, z, order = 'YXZ') => new THREE.Matrix4().makeRotationFromEuler(_e.set(x, y, z, order))
const tr = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z)
const sc = (x, y = x, z = x) => new THREE.Matrix4().makeScale(x, y, z)
const mul = (...ms) => ms.reduce((a, b) => a.multiply(b), new THREE.Matrix4())

/* ---------------------------- caule ---------------------------------- */

// Caule em "tartaruga": barras + conectores redondos, com leve curvatura orgânica.
function stem(b, { height, rand, color = C.leaf, joint = C.sageDark, lean = 0.1, leaves = [] }) {
  const frame = new THREE.Matrix4()
  b.add('roundBrick', C.olive, frame, 'stem')
  frame.multiply(tr(0, BRICK, 0))
  let y = BRICK
  let seg = 0
  const bendAxis = rand() * Math.PI * 2
  const nodes = []
  while (y < height - 1) {
    const len = height - y > 3.6 ? 3 : 2
    b.add(len === 3 ? 'bar3' : 'bar2', color, frame, 'stem')
    frame.multiply(tr(0, len, 0))
    // leve curvatura a cada segmento
    const k = lean * (0.6 + rand() * 0.6)
    frame.multiply(rot(Math.cos(bendAxis) * k * 0.35, 0, Math.sin(bendAxis) * k * 0.35))
    b.add('roundPlate', joint, mul(frame.clone(), tr(0, -0.2, 0)), 'stem')
    frame.multiply(tr(0, PLATE - 0.2, 0))
    y += len + PLATE - 0.2
    nodes.push({ frame: frame.clone(), y, seg: seg++ })
  }
  // folhas nos nós pedidos
  for (const L of leaves) {
    const node = nodes[Math.min(nodes.length - 1, L.node)]
    if (!node) continue
    const f = node.frame.clone()
    if (L.kind === 'slope') slopeLeaf(b, f, L.angle, L.color || C.leaf, L.size || 3)
    else plateLeaf(b, f, L.angle, L.color || C.leaf, L.pitch ?? 0.5, L.scale || 1)
  }
  return frame
}

// Folha estrutural: nervura (barra) com slopes espelhados, afinando até a ponta.
function slopeLeaf(b, frame, angle, color, n) {
  const F = frame.clone().multiply(rot(0, angle, 0)).multiply(tr(0, -0.45, 0.25)).multiply(rot(-0.5, 0, 0))
  b.add('bar3', C.leaf, F.clone().multiply(rot(Math.PI / 2, 0, 0)), 'leaf')
  for (let i = 0; i < n; i++) {
    const s = 1 - i * 0.16
    const z = 0.7 + i * 0.95
    const droop = 0.12 + i * 0.1
    const col = i % 2 ? C.lime : color
    b.add('slope', col, F.clone().multiply(tr(0.25, -0.35, z)).multiply(rot(droop, Math.PI / 2, 0)).multiply(sc(s)), 'leaf')
    b.add('slope', col, F.clone().multiply(tr(-0.25, -0.35, z)).multiply(rot(droop, -Math.PI / 2, 0)).multiply(sc(s)), 'leaf')
  }
  b.add('slope', C.lime, F.clone().multiply(tr(0, -0.3, 0.7 + n * 0.95 - 0.4)).multiply(rot(0.2, 0, 0)).multiply(sc(0.6)), 'leaf')
}

function plateLeaf(b, frame, angle, color, pitch, s) {
  const m = frame
    .clone()
    .multiply(rot(0, angle, 0))
    .multiply(tr(0, -0.25, 0.1))
    .multiply(rot(-pitch, 0, 0))
    .multiply(sc(s))
  b.add('leaf', color, m, 'leaf')
}

/* ---------------------------- cabeças -------------------------------- */

function ring(b, frame, { n, type, color, pitch, radius = 0.3, y = 0, phase = 0, s = 1, roll = 0, role = 'petal' }) {
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2
    const m = frame
      .clone()
      .multiply(tr(0, y, 0))
      .multiply(rot(0, a, 0))
      .multiply(tr(0, 0, radius))
      .multiply(rot(-pitch, 0, roll))
      .multiply(sc(s))
    b.add(type, typeof color === 'function' ? color(i) : color, m, role)
  }
}

function center(b, frame, color, tall = false) {
  b.add('roundPlate', color, frame.clone().multiply(tr(0, 0.05, 0)), 'center')
  if (tall) b.add('cone', color, frame.clone().multiply(tr(0, 0.45, 0)), 'center')
}

const HEADS = {
  daisy(b, f, { petal = C.white, core = C.yellow, s = 1 }) {
    center(b, f, core, true)
    ring(b, f, { n: 8, type: 'petalS', color: petal, pitch: 0.12, radius: 0.35, y: 0.2, s })
    ring(b, f, { n: 8, type: 'petalS', color: petal, pitch: 0.3, radius: 0.2, y: 0.42, phase: Math.PI / 8, s: s * 0.8 })
  },
  rose(b, f, { petal = C.pink, inner = C.pinkHot, s = 1 }) {
    center(b, f, inner, true)
    ring(b, f, { n: 6, type: 'petalL', color: petal, pitch: 0.2, radius: 0.5, y: 0.1, s })
    ring(b, f, { n: 5, type: 'petalS', color: petal, pitch: 0.75, radius: 0.35, y: 0.45, phase: 0.6, s })
    ring(b, f, { n: 4, type: 'petalS', color: inner, pitch: 1.15, radius: 0.2, y: 0.8, phase: 1.1, s: s * 0.85 })
  },
  tulip(b, f, { petal = C.orange, inner = C.coral, s = 1 }) {
    center(b, f, C.yellow, true)
    ring(b, f, { n: 3, type: 'petalT', color: inner, pitch: 1.2, radius: 0.35, y: 0.0, s })
    ring(b, f, { n: 3, type: 'petalT', color: petal, pitch: 1.12, radius: 0.55, y: -0.1, phase: Math.PI / 3, s: s * 1.05 })
  },
  sunflower(b, f, { petal = C.yellow, core = C.terracotta, s = 1 }) {
    b.add('plate2x2', core, f.clone().multiply(tr(0, 0.1, 0)), 'center')
    ring(b, f, { n: 12, type: 'petalL', color: petal, pitch: 0.05, radius: 0.9, y: 0, s })
    ring(b, f, { n: 12, type: 'petalS', color: C.orange, pitch: 0.2, radius: 0.7, y: 0.3, phase: Math.PI / 12, s })
  },
  allium(b, f, { petal = C.lilac, s = 1 }) {
    const n = 34
    const R = 1.7 * s
    const cf = f.clone().multiply(tr(0, R * 0.9, 0))
    for (let i = 0; i < n; i++) {
      const yy = 1 - (i / (n - 1)) * 1.7
      const r = Math.sqrt(Math.max(0, 1 - yy * yy))
      const th = i * 2.39996
      _v.set(Math.cos(th) * r, yy, Math.sin(th) * r).normalize()
      _q.setFromUnitVectors(UP, _v)
      const m = cf.clone().multiply(new THREE.Matrix4().compose(_v.clone().multiplyScalar(R), _q.clone(), new THREE.Vector3(1, 1, 1)))
      b.add('roundPlate', i % 5 === 0 ? C.pink : petal, m, 'petal')
    }
  },
  spike(b, f, { petal = C.pinkHot, alt = C.pink, s = 1 }) {
    let g = f.clone()
    for (let i = 0; i < 6; i++) {
      const k = 1 - i * 0.12
      ring(b, g, { n: 3, type: 'petalS', color: i % 2 ? alt : petal, pitch: 0.55 + i * 0.12, radius: 0.2, y: 0, phase: i * 1.05, s: s * k * 0.75 })
      b.add('roundPlate', C.leaf, g, 'center')
      g = g.clone().multiply(tr(0, 0.95 * k, 0))
    }
    b.add('cone', alt, g, 'center')
  },
  bud(b, f, { petal = C.pink }) {
    b.add('cone', C.leaf, f, 'center')
    ring(b, f, { n: 3, type: 'petalT', color: petal, pitch: 1.3, radius: 0.15, y: 0.3, s: 0.6 })
  },
}

export function buildFlower({ kind = 'daisy', height = 14, rand = Math.random, head = {}, leaves, lean = 0.12 }) {
  const b = new Builder()
  const a0 = rand() * 6.28
  const defaultLeaves = [
    { node: 0, angle: a0, pitch: 0.6, scale: 0.85 + rand() * 0.25 },
    { node: 1, angle: a0 + 2.4, pitch: 0.5, scale: 0.8 + rand() * 0.25, color: rand() < 0.4 ? C.sage : C.leaf },
    { node: 2 + Math.floor(rand() * 2), angle: a0 + 4.6, pitch: 0.45, scale: 0.65 + rand() * 0.2 },
  ]
  const top = stem(b, { height, rand, lean, leaves: leaves || defaultLeaves })
  HEADS[kind](b, top, head)
  return b.parts
}

// A flor-herói: uma rosa grande com folhas de slope e um botão lateral.
export function buildHero() {
  const r = (() => {
    let s = 7
    return () => ((s = (s * 16807) % 2147483647) / 2147483647)
  })()
  const b = new Builder()
  const top = stem(b, {
    height: 22,
    rand: r,
    lean: 0.08,
    leaves: [
      { node: 1, angle: 0.4, kind: 'slope', size: 3 },
      { node: 2, angle: 0.4 + Math.PI, kind: 'slope', size: 3 },
      { node: 3, angle: 2.2, pitch: 0.45, scale: 1.15 },
      { node: 4, angle: 5.0, pitch: 0.55, scale: 1.0, color: C.sage },
    ],
  })
  // Cabeça: rosa em quatro camadas, com sépalas verdes por baixo.
  ring(b, top, { n: 5, type: 'petalS', color: C.leaf, pitch: -0.35, radius: 0.3, y: -0.2, phase: 0.3, role: 'sepal' })
  center(b, top, C.yellow, true)
  ring(b, top, { n: 7, type: 'petalL', color: C.pink, pitch: 0.12, radius: 0.55, y: 0.05, s: 1.1 })
  ring(b, top, { n: 6, type: 'petalL', color: C.blush, pitch: 0.5, radius: 0.45, y: 0.35, phase: 0.45 })
  ring(b, top, { n: 5, type: 'petalS', color: C.pink, pitch: 0.95, radius: 0.35, y: 0.7, phase: 0.9 })
  ring(b, top, { n: 4, type: 'petalS', color: C.pinkHot, pitch: 1.25, radius: 0.18, y: 1.0, phase: 1.4, s: 0.85 })
  return b.parts
}

// Roseta de folhas rente ao chão — forração dos canteiros.
export function buildRosette(rand, color = C.leaf) {
  const b = new Builder()
  const f = new THREE.Matrix4()
  b.add('roundPlate', C.olive, f, 'leaf')
  const n = 4 + Math.floor(rand() * 3)
  const a0 = rand() * 6.28
  for (let i = 0; i < n; i++) {
    const m = f
      .clone()
      .multiply(tr(0, 0.1 + (i % 2) * 0.12, 0))
      .multiply(rot(0, a0 + (i / n) * Math.PI * 2, 0))
      .multiply(tr(0, 0, 0.2))
      .multiply(rot(-0.3 - rand() * 0.25, 0, 0))
      .multiply(sc(0.5 + rand() * 0.25))
    b.add('leaf', i % 3 === 0 ? C.sage : color, m, 'leaf')
  }
  return b.parts
}

export const FLOWER_KINDS = ['daisy', 'rose', 'tulip', 'sunflower', 'allium', 'spike']

export const HEAD_PALETTES = {
  daisy: [
    { petal: C.white, core: C.yellow },
    { petal: C.pink, core: C.yellow },
    { petal: C.butter, core: C.orange },
  ],
  rose: [
    { petal: C.pink, inner: C.pinkHot },
    { petal: C.coral, inner: C.orange },
    { petal: C.blush, inner: C.pink },
  ],
  tulip: [
    { petal: C.orange, inner: C.coral },
    { petal: C.yellow, inner: C.orange },
    { petal: C.pinkHot, inner: C.pink },
  ],
  sunflower: [{ petal: C.yellow, core: C.terracotta }],
  allium: [{ petal: C.lilac }, { petal: C.pink }],
  spike: [
    { petal: C.pinkHot, alt: C.pink },
    { petal: C.orange, alt: C.yellow },
  ],
}
