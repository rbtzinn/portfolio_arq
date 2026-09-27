// Exporta o mundo procedural (mesma geometria e lógica do site) para o Blender:
//   build/geo/*.bin      malhas por tipo de peça (posições, normais, índices)
//   build/scene.json     objetos, cor, câmera por frame (desktop/mobile), luz, etiquetas
//   build/xforms.bin     matriz 4×4 (linha-major, Z-up) de cada objeto em cada frame
// Uso: node blender/export.mjs [frames=240]
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { buildGeometries, baseStud, PLATE } from '../src/jardim/bricks/geometry.js'
import { buildHeroWorld, poseHero, buildGardenWorld, poseGarden, cameraAt, SEQ_END } from '../src/jardim/bricks/world.js'
import { smooth, invLerp } from '../src/jardim/store.js'

const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'build')
const N = +(process.argv[2] || 240)
// --meta: só regrava meta.json (seguro durante um render em andamento)
const META_ONLY = process.argv.includes('--meta')
fs.mkdirSync(path.join(OUT, 'geo'), { recursive: true })

// Y-up (three) → Z-up (Blender)
const ZUP = new THREE.Matrix4().makeRotationX(Math.PI / 2)
const rowMajor = (m, out, o) => {
  const e = m.elements
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[o + r * 4 + c] = e[c * 4 + r]
}

/* ---------------- malhas ---------------- */
function writeGeo(name, g) {
  g = g.index ? g : mergeVertices(g, 1e-5)
  if (!g.attributes.normal) g.computeVertexNormals()
  const pos = g.attributes.position.array
  const nor = g.attributes.normal.array
  const idx = g.index.array
  const head = new Uint32Array([pos.length / 3, idx.length])
  const buf = Buffer.concat([Buffer.from(head.buffer), Buffer.from(new Float32Array(pos).buffer), Buffer.from(new Float32Array(nor).buffer), Buffer.from(new Uint32Array(idx).buffer)])
  if (!META_ONLY) fs.writeFileSync(path.join(OUT, 'geo', name + '.bin'), buf)
  return idx.length / 3
}
const geos = buildGeometries(28)
let tris = 0
for (const [k, g] of Object.entries(geos)) tris += writeGeo(k, g)

/* ---------------- mundo ---------------- */
const hero = buildHeroWorld(60)
const garden = buildGardenWorld({ budget: 1, density: 1 })

const objects = []
const color = new THREE.Color()
const addObj = (part, mesh) => {
  part.oid = objects.length
  color.set(part.color)
  objects.push({ mesh, color: [color.r, color.g, color.b], role: part.role || part.type })
}
hero.parts.forEach((p) => addObj(p, p.type))
garden.flowers.forEach((f) => f.parts.forEach((p) => addObj(p, p.type)))
garden.props.forEach((p) => addObj(p, p.type))
// placa-base + pinos de cada canteiro numa malha só
garden.slabs.forEach((sl, i) => {
  const body = new RoundedBoxGeometry(sl.w - 0.04, PLATE, sl.d - 0.04, 2, 0.06)
  body.translate(0, PLATE / 2, 0)
  body.deleteAttribute('uv')
  const parts = [body]
  for (let a = 0; a < sl.w; a++)
    for (let b = 0; b < sl.d; b++) {
      const s = baseStud()
      s.deleteAttribute('uv')
      s.translate(-sl.w / 2 + 0.5 + a, PLATE, -sl.d / 2 + 0.5 + b)
      parts.push(s)
    }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))
  tris += writeGeo('slab' + i, g)
  sl.color = sl.color
  addObj(sl, 'slab' + i)
})

// lista de peças da flor-herói (mostrada no capítulo do caule)
function heroBOM() {
  const parts = hero.parts.filter((p) => p.role !== 'decoy')
  const count = (fn) => parts.filter(fn).length
  const stemLike = (p) => p.role === 'stem' || p.role === 'leaf'
  return {
    bars: count((p) => stemLike(p) && p.type.startsWith('bar')),
    plates: count((p) => stemLike(p) && (p.type === 'roundPlate' || p.type === 'roundBrick')),
    slopes: count((p) => p.type === 'slope'),
    leaves: count((p) => p.type === 'leaf'),
    petals: count((p) => p.type.startsWith('petal')),
  }
}

/* ---------------- frames ---------------- */
const NO = objects.length
const xf = new Float32Array(N * NO * 16)
const tmp = new THREE.Matrix4()
const frames = []
const cams = { desktop: 16 / 10, mobile: 9 / 16 }
const camObj = new THREE.PerspectiveCamera()
const v = new THREE.Vector3()

for (let f = 0; f < N; f++) {
  const P = (f / (N - 1)) * SEQ_END
  const base = f * NO * 16
  const emit = (part, m) => {
    const o = base + part.oid * 16
    if (!m) {
      xf[o] = NaN
      return
    }
    rowMajor(tmp.multiplyMatrices(ZUP, m), xf, o)
  }
  const built = poseHero(hero, P, emit) + poseGarden(garden, P, emit)

  const fr = { P, built, light: smooth(invLerp(0.085, 0.2, P)), garden: smooth(invLerp(0.5, 0.62, P)), cam: {}, labels: {} }
  for (const [variant, aspect] of Object.entries(cams)) {
    const c = cameraAt(P, aspect)
    camObj.fov = c.fov
    camObj.aspect = aspect
    camObj.position.copy(c.pos)
    camObj.lookAt(c.tgt)
    camObj.updateMatrixWorld()
    camObj.updateProjectionMatrix()
    const mb = new Float32Array(16)
    rowMajor(tmp.multiplyMatrices(ZUP, camObj.matrixWorld), mb, 0)
    fr.cam[variant] = { m: Array.from(mb), fov: c.fov, focus: c.pos.distanceTo(c.tgt), pos: c.pos.toArray(), tgt: c.tgt.toArray() }
    // etiquetas dos projetos: posição normalizada (0..1) no quadro renderizado
    fr.labels[variant] = garden.labels.map((L) => {
      v.copy(L.pos).project(camObj)
      const vis = smooth(invLerp(L.t0 + 0.02, L.t0 + 0.05, P))
      return [+((v.x + 1) / 2).toFixed(4), +((1 - v.y) / 2).toFixed(4), v.z < 1 ? +vis.toFixed(3) : 0]
    })
  }
  frames.push(fr)
}

// dados para o site: peças montadas por frame, etiquetas e câmera final (compositing do buquê)
const last = frames[N - 1]
fs.writeFileSync(
  path.join(OUT, 'meta.json'),
  JSON.stringify({
    frames: N,
    seqEnd: SEQ_END,
    total: hero.count + garden.count,
    bom: heroBOM(),
    built: frames.map((f) => f.built),
    labels: { desktop: frames.map((f) => f.labels.desktop), mobile: frames.map((f) => f.labels.mobile) },
    final: {
      desktop: { ...last.cam.desktop, m: undefined, aspect: cams.desktop },
      mobile: { ...last.cam.mobile, m: undefined, aspect: cams.mobile },
    },
  }),
)
if (META_ONLY) {
  console.log('meta.json atualizado')
  process.exit(0)
}
fs.writeFileSync(path.join(OUT, 'xforms.bin'), Buffer.from(xf.buffer))
fs.writeFileSync(
  path.join(OUT, 'scene.json'),
  JSON.stringify({ frames: N, objects, frameData: frames, seqEnd: SEQ_END, heroCount: hero.count, gardenCount: garden.count }),
)
console.log(`objetos ${NO}, frames ${N}, tris únicos ${tris}, xforms ${(xf.byteLength / 1e6).toFixed(1)} MB`)
