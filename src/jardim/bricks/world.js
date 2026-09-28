// Mundo da narrativa, sem React: layout da flor-herói e do jardim, poses por progresso e
// trilha de câmera. É a fonte única de verdade do exportador para o Blender
// (blender/export.mjs), que calcula aqui as matrizes de cada frame renderizado.
import * as THREE from 'three'
import { buildHero, buildFlower, buildRosette, HEAD_PALETTES } from './flowers.js'
import { BRICK, PLATE } from './geometry.js'
import { C } from './material.js'
import { clamp, lerp, smooth, easeInOutCubic, easeOutCubic, easeOutBack, rng, CH } from '../store.js'

// A sequência pré-renderizada cobre 0 → SEQ_END; depois a câmera fica parada no buquê.
export const SEQ_END = 0.88
// tempo "virtual" das derivas: ligado ao scroll, para ser renderizável quadro a quadro
export const timeAt = (P) => P * 60

/* ------------------------------------------------------------------ */
/* câmera                                                              */
/* ------------------------------------------------------------------ */

const KEYS = [
  [0.0, [0, 13, 36], [0, 13, 0]],
  [0.08, [3, 13, 32], [0, 12.5, 0]],
  [0.14, [11, 6.5, 22], [0, 5, 0]],
  [0.22, [-9, 12, 22], [0, 10.5, 0]],
  [0.3, [8, 21, 20], [0, 18, 0]],
  [0.37, [-4, 32, 15], [0, 22, 0]],
  [0.44, [9, 29, 16], [0, 22.5, 0]],
  [0.5, [15, 27, 27], [0, 18, 0]],
  [0.56, [26, 31, 44], [-2, 10, -12]],
  [0.62, [9, 16, 20], [0, 9, -18]],
  [0.68, [5, 15, -12], [-3, 8, -42]],
  [0.74, [-5, 15, -46], [3, 8, -76]],
  [0.8, [4, 16, -86], [-3, 9, -120]],
  [SEQ_END, [5, 18, -119], [-6, 11.5, -165]],
]
const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[1])), false, 'centripetal')
const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[2])), false, 'centripetal')
const KP = KEYS.map((k) => k[0])

// aspect < 1 (retrato): afasta a câmera, centraliza o assunto e o sobe no quadro
export function cameraAt(P, aspect = 1.6, out = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 34 }) {
  P = clamp(P, 0, SEQ_END)
  let i = 0
  while (i < KP.length - 2 && P > KP[i + 1]) i++
  const local = clamp((P - KP[i]) / (KP[i + 1] - KP[i]))
  const u = (i + local) / (KP.length - 1)
  posCurve.getPoint(u, out.pos)
  tgtCurve.getPoint(u, out.tgt)
  if (aspect < 1) {
    const k = 1 - aspect
    const center = clamp((P - 0.8) / 0.08)
    out.tgt.x *= 1 - center * 0.85
    out.pos.x *= 1 - center * 0.6
    const pull = 1 + k * (0.55 - center * 0.25)
    out.pos.sub(out.tgt).multiplyScalar(pull).add(out.tgt)
    out.tgt.y -= k * 5
  }
  out.fov = aspect < 1 ? 46 : 34
  return out
}

/* ------------------------------------------------------------------ */
/* flor-herói                                                          */
/* ------------------------------------------------------------------ */

const DECOY_TYPES = ['roundBrick', 'roundPlate', 'cone', 'bar3', 'petalS', 'petalL', 'slope', 'leaf', 'petalT']
const DECOY_COLORS = [C.pink, C.orange, C.yellow, C.leaf, C.sage, C.coral, C.pinkHot, C.lime, C.white, C.blush]
export const HERO_BASE = new THREE.Vector3(0, PLATE, 0)

export function buildHeroWorld(decoys = 60) {
  const parts = buildHero()
  const r = rng(42)
  for (let i = 0; i < decoys; i++) {
    parts.push({
      type: DECOY_TYPES[Math.floor(r() * DECOY_TYPES.length)],
      color: DECOY_COLORS[Math.floor(r() * DECOY_COLORS.length)],
      matrix: new THREE.Matrix4(),
      role: 'decoy',
      order: 999,
    })
  }
  for (const p of parts) {
    p.tp = new THREE.Vector3()
    p.tq = new THREE.Quaternion()
    p.ts = new THREE.Vector3()
    p.matrix.decompose(p.tp, p.tq, p.ts)
  }
  const stemParts = parts.filter((p) => p.role === 'stem' || p.role === 'leaf')
  const headParts = parts.filter((p) => ['sepal', 'center', 'petal'].includes(p.role))
  stemParts
    .sort((a, b) => a.tp.y - b.tp.y)
    .forEach((p, i, arr) => {
      p.t0 = lerp(CH.stem[0] + 0.005, CH.stem[1] - 0.04, i / (arr.length - 1))
      p.dur = 0.045
    })
  headParts.forEach((p, i, arr) => {
    p.t0 = lerp(CH.bloom[0] + 0.005, CH.bloom[1] - 0.045, i / (arr.length - 1))
    p.dur = 0.035
  })
  for (const p of parts) {
    const th = r() * Math.PI * 2
    const rad = 4 + Math.pow(r(), 0.8) * (p.role === 'decoy' ? 20 : 12)
    p.sp = new THREE.Vector3(Math.cos(th) * rad * 1.3, 13 + (r() - 0.5) * 20, Math.sin(th) * rad * 0.9 - 8)
    p.sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6))
    p.axis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
    p.spin = 0.15 + r() * 0.4
    p.phase = r() * 10
    if (p.role === 'decoy') {
      p.t0 = 0.1 + r() * 0.08
      p.dir = p.sp.clone().sub(new THREE.Vector3(0, 13, 0)).normalize()
    }
  }
  const real = parts.filter((p) => p.role !== 'decoy').sort((a, b) => a.t0 - b.t0)
  real.forEach((p, i) => {
    p.f = i / (real.length - 1)
    p.theta = i * 2.39996
    p.R = 5 + (i % 3) * 0.9
  })
  return { parts, count: real.length }
}

const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _up = new THREE.Vector3()
const _a = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _g = new THREE.Matrix4()
const _t = new THREE.Matrix4()
const _sm = new THREE.Matrix4()
const _e = new THREE.Euler()
const _one = new THREE.Vector3(1, 1, 1)

// Chama emit(part, matrixMundo | null) para cada peça. null = invisível.
export function poseHero(world, P, emit) {
  let built = 0
  const t = timeAt(P)
  const show = clamp((P - CH.stem[0]) / (CH.reveal[1] - CH.stem[0]))
  _g.makeRotationY(Math.sin(t * 0.25) * 0.04 * show + show * 0.9).setPosition(HERO_BASE)
  for (const p of world.parts) {
    _p.copy(p.sp)
    _p.x += Math.sin(t * 0.3 + p.phase) * 0.6
    _p.y += Math.sin(t * 0.45 + p.phase * 1.3) * 0.8
    _q.setFromAxisAngle(p.axis, t * p.spin).premultiply(p.sq)
    _s.set(1, 1, 1)

    if (p.role === 'decoy') {
      const a = clamp((P - p.t0) / 0.14)
      const e = a * a
      _p.addScaledVector(p.dir, e * 45)
      _p.y -= e * 10
      const k = 1 - smooth(clamp((a - 0.6) / 0.4))
      if (k <= 0.001) {
        emit(p, null)
        continue
      }
      _s.setScalar(k)
      emit(p, _m.compose(_p, _q, _s).premultiply(_t.makeTranslation(HERO_BASE.x, HERO_BASE.y, HERO_BASE.z)))
      continue
    }

    // luz acende: o caos se organiza numa espiral em volta da flor
    const g = smooth(clamp((P - 0.08 - p.f * 0.02) / 0.06))
    if (g > 0) {
      const th = p.theta + t * 0.12
      _a.set(Math.cos(th) * p.R, lerp(1.5, 27, p.f) + Math.sin(t * 0.7 + p.phase) * 0.35, Math.sin(th) * p.R)
      _p.lerp(_a, g)
    }
    const a = clamp((P - p.t0) / p.dur)
    if (a > 0) {
      const fly = easeInOutCubic(clamp(a / 0.72))
      const settle = smooth(clamp((a - 0.62) / 0.38))
      _up.set(0, 1, 0).applyQuaternion(p.tq)
      _p.lerp(_a.copy(p.tp).addScaledVector(_up, 2.4 * (1 - settle)), fly)
      _q2.copy(p.tq)
      _q.slerp(_q2, easeOutCubic(clamp(a / 0.8)))
    }
    if (a >= 1) built++
    _s.copy(p.ts)
    // estalo do encaixe, medido em progresso (renderizável)
    const x = (P - (p.t0 + p.dur)) / 0.01
    if (x > 0 && x < 2) {
      const k = Math.exp(-x * 3) * Math.cos(x * 9) * 0.14
      _s.y *= 1 - k
      _s.x *= 1 + k * 0.5
      _s.z *= 1 + k * 0.5
    }
    // montadas giram com a flor; soltas ficam no espaço do mundo
    _m.compose(_p, _q, _s)
    if (a > 0 || g > 0) emit(p, _m.premultiply(_g))
    else emit(p, _m.premultiply(_t.makeTranslation(HERO_BASE.x, HERO_BASE.y, HERO_BASE.z)))
  }
  return built
}

/* ------------------------------------------------------------------ */
/* jardim                                                              */
/* ------------------------------------------------------------------ */

export const BEDS = [
  { x: 0, z: 0, w: 10, d: 10, hero: true, kinds: ['daisy', 'tulip'], n: 4 },
  { x: -12, z: -26, w: 12, d: 16, project: 0, kinds: ['rose', 'daisy', 'spike'], n: 11 },
  { x: 11, z: -16, w: 10, d: 14, kinds: ['tulip', 'allium', 'daisy'], n: 7 },
  { x: 12, z: -54, w: 12, d: 16, project: 1, kinds: ['sunflower', 'tulip', 'daisy'], n: 10 },
  { x: -11, z: -56, w: 10, d: 14, kinds: ['allium', 'spike', 'rose'], n: 7 },
  { x: -12, z: -84, w: 12, d: 16, project: 2, kinds: ['tulip', 'allium', 'rose'], n: 11 },
  { x: 11, z: -86, w: 10, d: 14, kinds: ['daisy', 'rose', 'spike'], n: 7 },
  { x: 12, z: -114, w: 12, d: 16, project: 3, kinds: ['rose', 'spike', 'daisy'], n: 11 },
  { x: -11, z: -116, w: 10, d: 14, kinds: ['sunflower', 'daisy', 'tulip'], n: 7 },
  { x: -28, z: -30, w: 14, d: 30, kinds: ['sunflower', 'allium', 'spike'], n: 12, far: true },
  { x: 28, z: -46, w: 14, d: 30, kinds: ['tulip', 'rose', 'spike'], n: 12, far: true },
  { x: -28, z: -80, w: 14, d: 30, kinds: ['daisy', 'tulip', 'allium'], n: 12, far: true },
  { x: 28, z: -100, w: 14, d: 30, kinds: ['sunflower', 'daisy', 'rose'], n: 12, far: true },
  { x: -28, z: -128, w: 14, d: 26, kinds: ['rose', 'spike'], n: 10, far: true },
  { x: 28, z: -140, w: 14, d: 22, kinds: ['tulip', 'allium'], n: 9, far: true },
]
export const PLANTER_H = BRICK * 2
export const PEDESTAL = new THREE.Vector3(0, 0, -165)

function zTrigger(z) {
  if (z > -34) return 0.49 + (Math.max(0, -z) / 34) * 0.06
  return 0.62 + (-40 - z) / 560
}
const bedTrigger = (bed) => (bed.hero ? 0.47 : zTrigger(bed.z + bed.d / 2))

export function buildGardenWorld({ budget = 1, density = 1 } = {}) {
  const r = rng(1234)
  const beds = BEDS.map((b) => ({ ...b }))
  const flowers = []
  const props = [] // jardineiras, caminho, peças soltas: { type, color, matrix, t0, order }
  const slabs = [] // placa-base + pinos de cada canteiro: { x, y, z, w, d, color, t0 }

  for (const bed of beds) {
    const top = bed.project != null ? PLANTER_H : PLATE
    bed.top = top
    bed.t0 = bedTrigger(bed)
    const inset = bed.project != null ? 1 : 0
    const sw = bed.w - inset * 2
    const sd = bed.d - inset * 2
    slabs.push({ x: bed.x, z: bed.z, y: top - PLATE, w: sw, d: sd, color: bed.project != null ? C.sageDark : C.sage, t0: bed.t0 })

    if (bed.project != null) {
      const cols = [C.terracotta, C.tan, C.cream]
      for (let layer = 0; layer < 2; layer++) {
        const y = layer * BRICK
        for (let i = 0; i < bed.w / 4; i++)
          for (const side of [-1, 1])
            props.push({
              type: 'brick1x4',
              color: cols[(i + layer + (side > 0 ? 1 : 0)) % 3],
              matrix: new THREE.Matrix4().makeTranslation(bed.x - bed.w / 2 + 2 + i * 4, y, bed.z + side * (bed.d / 2 - 0.5)),
              t0: bed.t0,
              order: layer,
            })
        for (let i = 0; i < Math.floor((bed.d - 2) / 4); i++)
          for (const side of [-1, 1])
            props.push({
              type: 'brick1x4',
              color: cols[(i + layer + 2) % 3],
              matrix: new THREE.Matrix4()
                .makeTranslation(bed.x + side * (bed.w / 2 - 0.5), y, bed.z - (bed.d - 2) / 2 + 2 + i * 4)
                .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)),
              t0: bed.t0,
              order: layer,
            })
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            props.push({
              type: 'roundBrick',
              color: C.cream,
              matrix: new THREE.Matrix4().makeTranslation(bed.x + sx * (bed.w / 2 - 0.5), y, bed.z + sz * (bed.d / 2 - 0.5)),
              t0: bed.t0,
              order: layer,
            })
      }
    }

    const n = Math.max(1, Math.round(bed.n * budget))
    const placed = []
    let tries = 0
    while (placed.length < n && tries++ < 400) {
      const x = bed.x - sw / 2 + 0.5 + Math.floor(r() * (sw - 2)) + 1
      const z = bed.z - sd / 2 + 0.5 + Math.floor(r() * (sd - 2)) + 1
      if (bed.hero && Math.hypot(x, z) < 3.2) continue
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < (bed.hero ? 3.5 : 3.2))) continue
      placed.push({ x, z })
    }
    for (const pl of placed) {
      const kind = bed.kinds[Math.floor(r() * bed.kinds.length)]
      const pals = HEAD_PALETTES[kind]
      const head = pals[Math.floor(r() * pals.length)]
      const nearPath = Math.abs(pl.x) < 10
      let height = bed.hero ? 6 + r() * 4 : nearPath ? 6.5 + r() * 5.5 : 8 + r() * 7
      if (bed.far) height += 2 + r() * 3
      const parts = buildFlower({ kind, height, rand: r, head, lean: 0.1 + r() * 0.1 })
      parts.forEach((p, i) => (p.k = i / parts.length))
      flowers.push({ x: pl.x, z: pl.z, y: top, rotY: r() * Math.PI * 2, phase: r() * 10, t0: bed.t0 + r() * 0.02, span: 0.028, parts, h: height + 4 })
    }
    const nr = Math.round(((sw * sd) / 22) * density)
    for (let i = 0; i < nr; i++) {
      const x = bed.x - sw / 2 + 1.5 + Math.floor(r() * (sw - 3))
      const z = bed.z - sd / 2 + 1.5 + Math.floor(r() * (sd - 3))
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 1.6)) continue
      if (bed.hero && Math.hypot(x, z) < 2.5) continue
      const parts = buildRosette(r, r() < 0.5 ? C.leaf : C.sageDark)
      parts.forEach((p, k) => (p.k = k / parts.length))
      flowers.push({ x, z, y: top, rotY: r() * 6.28, phase: r() * 10, t0: bed.t0 + 0.004 + r() * 0.01, span: 0.012, parts, h: 3 })
    }
  }

  // peças que sobraram na mesa
  const LEFT = ['petalS', 'roundPlate', 'slope', 'bar2', 'plate2x2', 'cone', 'roundBrick', 'petalL']
  const LCOL = [C.pink, C.orange, C.yellow, C.leaf, C.white, C.coral, C.lilac, C.lime]
  for (let i = 0; i < Math.round(70 * density); i++) {
    const z = 8 - r() * 160
    const x = (r() < 0.5 ? -1 : 1) * (2.8 + r() * 3.4)
    const type = LEFT[Math.floor(r() * LEFT.length)]
    const flat = type === 'bar2' ? new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 0.2, 0) : new THREE.Matrix4()
    props.push({
      type,
      color: LCOL[Math.floor(r() * LCOL.length)],
      matrix: new THREE.Matrix4().makeRotationY(r() * 6.28).setPosition(x, 0, z).multiply(flat),
      t0: zTrigger(z) + 0.005,
      order: 0,
    })
  }
  // caminho de tiles até o pedestal
  const pathCols = [C.cream, C.tan, C.white, C.cream]
  for (let z = -7; z > -160; z -= 2)
    for (const x of [-1, 1])
      props.push({
        type: 'tile2x2',
        color: pathCols[Math.floor(r() * pathCols.length)],
        matrix: new THREE.Matrix4().makeRotationY((r() - 0.5) * 0.06).setPosition(x, 0, z),
        t0: zTrigger(z) - 0.01,
        order: 0,
      })
  // pedestal do buquê (o buquê em si é interativo, em tempo real)
  for (let l = 0; l < 4; l++) {
    const rotd = l % 2 ? Math.PI / 2 : 0
    for (const o of [-1, 1]) {
      const off = new THREE.Vector3(0, 0, o).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotd)
      props.push({
        type: 'brick2x4',
        color: l % 2 ? C.white : C.cream,
        matrix: new THREE.Matrix4().makeTranslation(PEDESTAL.x + off.x, l * BRICK, PEDESTAL.z + off.z).multiply(new THREE.Matrix4().makeRotationY(rotd)),
        t0: 0.74,
        order: l,
      })
    }
  }

  const labels = beds.filter((b) => b.project != null).map((b) => ({ index: b.project, pos: new THREE.Vector3(b.x, 16, b.z), t0: b.t0 }))
  const count = flowers.reduce((n, f) => n + f.parts.length, 0) + props.length
  return { beds, flowers, props, slabs, labels, count }
}

export function poseGarden(world, P, emit) {
  let built = 0
  const t = timeAt(P)
  for (const fl of world.flowers) {
    const g0 = (P - fl.t0) / fl.span
    const sway = clamp(g0 - 1, 0, 1)
    _e.set(Math.sin(t * 0.9 + fl.phase) * 0.025 * sway, fl.rotY, Math.cos(t * 0.7 + fl.phase) * 0.025 * sway, 'YXZ')
    _q.setFromEuler(_e)
    _g.compose(_p.set(fl.x, fl.y, fl.z), _q, _one)
    for (const p of fl.parts) {
      const a = clamp((g0 - p.k * 0.75) / 0.25)
      if (a <= 0) {
        emit(p, null)
        continue
      }
      if (a < 1) {
        const s = easeOutBack(a, 2.2)
        _t.makeTranslation(0, (1 - smooth(a)) * 1.6, 0)
        _m.multiplyMatrices(_g, _t).multiply(p.matrix).multiply(_sm.makeScale(s, s, s))
      } else {
        _m.multiplyMatrices(_g, p.matrix)
        built++
      }
      emit(p, _m)
    }
  }
  for (const p of world.props) {
    const a = clamp((P - p.t0 + 0.012 - p.order * 0.006) / 0.012)
    if (a <= 0) {
      emit(p, null)
      continue
    }
    if (a < 1) {
      const s = easeOutBack(a, 1.6)
      _t.makeTranslation(0, (1 - smooth(a)) * 3, 0)
      _m.multiplyMatrices(_t, p.matrix).multiply(_sm.makeScale(1, s, 1))
    } else {
      _m.copy(p.matrix)
      built++
    }
    emit(p, _m)
  }
  for (const sl of world.slabs) {
    const a = clamp((P - sl.t0 + 0.02) / 0.014)
    if (a <= 0) {
      emit(sl, null)
      continue
    }
    const s = easeOutBack(a, 1.4)
    emit(sl, _m.makeScale(Math.max(0.001, s), Math.max(0.001, a), Math.max(0.001, s)).setPosition(sl.x, sl.y, sl.z))
  }
  return built
}

/* ------------------------------------------------------------------ */
/* buquê (final interativo)                                            */
/* ------------------------------------------------------------------ */

export const BOUQUET_POS = PEDESTAL
export const PED_H = BRICK * 4
// o turntable renderizado no Blender: um frame a cada 3°
export const TURN_FRAMES = 120

// Vaso + flores (e, opcionalmente, o pedestal) em coordenadas locais do pedestal.
export function buildBouquetParts({ withPedestal = true } = {}) {
  const r = rng(99)
  const parts = []
  const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z)
  for (let l = 0; l < (withPedestal ? 4 : 0); l++) {
    const rotd = l % 2 ? Math.PI / 2 : 0
    for (const o of [-1, 1]) {
      const off = new THREE.Vector3(0, 0, o).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotd)
      const m = T(off.x, l * BRICK, off.z).multiply(new THREE.Matrix4().makeRotationY(rotd))
      parts.push({ type: 'brick2x4', color: l % 2 ? C.white : C.cream, matrix: m, role: 'pedestal' })
    }
  }
  const vaseY = PED_H
  for (let l = 0; l < 3; l++) {
    const R = 1.55 + l * 0.18
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + l * 0.35
      parts.push({ type: 'roundBrick', color: (i + l) % 3 === 0 ? C.blush : C.terracotta, matrix: T(Math.cos(a) * R, vaseY + l * BRICK, Math.sin(a) * R), role: 'vase' })
    }
  }
  const kinds = [
    ['rose', { petal: C.pink, inner: C.pinkHot }, 16, 0, 0],
    ['sunflower', { petal: C.yellow, core: C.terracotta }, 14.5, 0.3, 0.2],
    ['tulip', { petal: C.orange, inner: C.coral }, 13.5, 0.36, 1.5],
    ['allium', { petal: C.lilac }, 15, 0.3, 2.6],
    ['daisy', { petal: C.white, core: C.yellow }, 12.5, 0.42, 3.5],
    ['spike', { petal: C.pinkHot, alt: C.pink }, 14, 0.34, 4.4],
    ['tulip', { petal: C.yellow, inner: C.orange }, 12, 0.46, 5.4],
    ['rose', { petal: C.coral, inner: C.orange }, 11.5, 0.5, 0.9],
  ]
  for (const [kind, head, h, tilt, dir] of kinds) {
    const fp = buildFlower({ kind, height: h, rand: r, head, lean: 0.05, leaves: [{ node: 2, angle: dir + 0.5, pitch: 0.5, scale: 0.8 }] })
    const k = tilt > 0 ? 1 : 0
    const base = T(Math.cos(dir) * 0.5 * k, vaseY + 0.4, Math.sin(dir) * 0.5 * k).multiply(
      new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(Math.sin(dir), 0, -Math.cos(dir)).normalize(), -tilt),
    )
    for (const p of fp) {
      p.matrix.premultiply(base)
      p.role = 'flower'
      parts.push(p)
    }
  }
  parts.forEach((p, i) => (p.order = i))
  return parts
}

// matriz de mundo de uma peça do buquê girado pelo ângulo `a` (em torno do eixo do pedestal)
export function bouquetWorldMatrix(part, a, out = new THREE.Matrix4()) {
  const spins = part.role !== 'pedestal'
  out.makeRotationY(spins ? a : 0).setPosition(BOUQUET_POS)
  return out.multiply(part.matrix)
}
