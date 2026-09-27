import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Unidade = 1 pino (stud pitch). Placa = 0.4, tijolo = 1.2, pino r = 0.3.
export const PLATE = 0.4
export const BRICK = 1.2
const STUD_R = 0.3
const STUD_H = 0.18

/* ------------------------------------------------------------------ */
/* utilitários                                                         */
/* ------------------------------------------------------------------ */

// Arredonda os cantos de uma polilinha 2D (perfil de torno).
function fillet(points, radii, steps = 4) {
  const out = []
  for (let i = 0; i < points.length; i++) {
    const r = radii[i] || 0
    const B = points[i]
    if (!r || i === 0 || i === points.length - 1) {
      out.push(B.clone())
      continue
    }
    const A = points[i - 1]
    const C = points[i + 1]
    const d1 = A.clone().sub(B).normalize()
    const d2 = C.clone().sub(B).normalize()
    const theta = Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1))
    const t = r / Math.tan(theta / 2)
    const P1 = B.clone().addScaledVector(d1, t)
    const P2 = B.clone().addScaledVector(d2, t)
    const bis = d1.clone().add(d2).normalize()
    const center = B.clone().addScaledVector(bis, r / Math.sin(theta / 2))
    let a1 = Math.atan2(P1.y - center.y, P1.x - center.x)
    let a2 = Math.atan2(P2.y - center.y, P2.x - center.x)
    let da = a2 - a1
    while (da > Math.PI) da -= Math.PI * 2
    while (da < -Math.PI) da += Math.PI * 2
    for (let s = 0; s <= steps; s++) {
      const a = a1 + (da * s) / steps
      out.push(new THREE.Vector2(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r))
    }
  }
  return out
}

function lathe(pts, radii, seg, steps = 4) {
  const prof = fillet(
    pts.map(([x, y]) => new THREE.Vector2(Math.max(x, 0.0001), y)),
    radii,
    steps,
  )
  return new THREE.LatheGeometry(prof, seg)
}

// Junta geometrias garantindo atributos compatíveis (somente position + normal).
function merge(list) {
  const anyNonIndexed = list.some((g) => !g.index)
  const prepared = list.map((g) => {
    let geo = anyNonIndexed && g.index ? g.toNonIndexed() : g
    for (const k of Object.keys(geo.attributes)) {
      if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k)
    }
    geo.clearGroups()
    return geo
  })
  const m = mergeGeometries(prepared, false)
  m.computeBoundingSphere()
  return m
}

function stud(seg, x = 0, y = 0, z = 0) {
  const g = lathe(
    [
      [STUD_R, -0.03],
      [STUD_R, STUD_H],
      [0, STUD_H],
    ],
    [0, 0.045, 0],
    seg,
    3,
  )
  g.translate(x, y, z)
  return g
}

/* ------------------------------------------------------------------ */
/* peças                                                               */
/* ------------------------------------------------------------------ */

// Tijolo redondo 1×1 (ou placa redonda) — torno completo com pino.
function roundPiece(h, seg) {
  return lathe(
    [
      [0, 0],
      [0.47, 0],
      [0.47, h],
      [STUD_R, h],
      [STUD_R, h + STUD_H],
      [0, h + STUD_H],
    ],
    [0, 0.06, 0.06, 0.025, 0.045, 0],
    seg,
  )
}

// Cone 1×1 — botões florais e base de tulipas.
function cone(seg) {
  return lathe(
    [
      [0, 0],
      [0.47, 0],
      [0.47, 0.18],
      [0.25, 1.02],
      [0.2, 1.02],
      [0.2, 1.2],
      [0, 1.2],
    ],
    [0, 0.05, 0.04, 0.04, 0.02, 0.05, 0],
    seg,
  )
}

// Barra (caule) de comprimento L com pontas arredondadas.
function bar(L, seg) {
  return lathe(
    [
      [0, 0],
      [0.2, 0],
      [0.2, L],
      [0, L],
    ],
    [0, 0.09, 0.09, 0],
    Math.max(10, Math.round(seg * 0.6)),
  )
}

// Tijolo/placa retangular com cantos levemente arredondados + pinos.
function brick(w, d, h, seg) {
  const body = new RoundedBoxGeometry(w - 0.04, h, d - 0.04, 2, 0.05)
  body.translate(0, h / 2, 0)
  const parts = [body]
  const sseg = Math.max(12, Math.round(seg * 0.7))
  for (let i = 0; i < w; i++)
    for (let j = 0; j < d; j++) parts.push(stud(sseg, i - (w - 1) / 2, h, j - (d - 1) / 2))
  return merge(parts)
}

// Placa arredondada com subdivisão real (o RoundedBox do three concentra os vértices nos cantos,
// o que impede a dobra). Grade não-uniforme: k segmentos em cada borda arredondada.
function slab(w, h, d, r, k, midX, midZ) {
  const nx = 2 * k + midX
  const ny = 2 * k + 1
  const nz = 2 * k + midZ
  const g = new THREE.BoxGeometry(2, 2, 2, nx, ny, nz)
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  const remap = (u, n, half) => {
    const i = Math.round(((u + 1) / 2) * n)
    if (i <= k) return -half + (r * i) / k
    if (i >= n - k) return half - (r * (n - i)) / k
    return -half + r + ((half - r) * 2 * (i - k)) / (n - 2 * k)
  }
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  const c = new THREE.Vector3()
  const hx = w / 2
  const hy = h / 2
  const hz = d / 2
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    v.set(remap(v.x, nx, hx), remap(v.y, ny, hy), remap(v.z, nz, hz))
    c.set(
      THREE.MathUtils.clamp(v.x, -hx + r, hx - r),
      THREE.MathUtils.clamp(v.y, -hy + r, hy - r),
      THREE.MathUtils.clamp(v.z, -hz + r, hz - r),
    )
    const dv = v.sub(c)
    if (dv.lengthSq() > 1e-10) dv.normalize().multiplyScalar(r)
    pos.setXYZ(i, c.x + dv.x, c.y + dv.y, c.z + dv.z)
  }
  return mergeVertices(g, 1e-5)
}

// Placa curva: afinada no contorno de uma pétala/folha e dobrada no comprimento e na largura.
// Origem: centro da borda de encaixe (z=0), espessura em +Y, comprimento em +Z.
function curvedPlate({ length, width, bend, cup, tip = 0.12, base = 0.5, seg, twist = 0 }) {
  const k = seg > 20 ? 3 : seg > 15 ? 2 : 1
  const mid = seg > 20 ? 12 : seg > 15 ? 9 : 6
  const g = slab(2, PLATE, length, 0.15, k, Math.ceil(mid * 0.6), mid)
  const pos = g.attributes.position
  const v = new THREE.Vector3()
  const maxHW = width / 2
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const z = v.z + length / 2
    const zn = z / length
    let hw
    if (zn < 0.55) hw = base + (maxHW - base) * Math.sin((zn / 0.55) * Math.PI * 0.5)
    else {
      const t = (zn - 0.55) / 0.45
      hw = Math.max(tip, maxHW * Math.sqrt(Math.max(0, 1 - t * t)))
    }
    const x = v.x * hw
    let y = v.y + PLATE / 2
    const b = Math.max(0, zn - 0.2)
    y += bend * length * b * b
    y += cup * x * x * (0.4 + zn)
    const tw = twist * b
    pos.setXYZ(i, x * Math.cos(tw) - 0 * Math.sin(tw), y + x * Math.sin(tw) * 0.5, z)
  }
  g.computeVertexNormals()
  const s = stud(Math.max(12, Math.round(seg * 0.7)), 0, PLATE, 0.5)
  return merge([g, s])
}

// Slope 1×2 45°: parte alta atrás (z 0..1), rampa até z=2.
function slope(seg) {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(2, 0)
  shape.lineTo(2, 0.22)
  shape.lineTo(1, BRICK)
  shape.lineTo(0, BRICK)
  shape.lineTo(0, 0)
  const depth = 0.86
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelOffset: -0.04,
    bevelSegments: 2,
    curveSegments: 4,
  })
  g.rotateY(-Math.PI / 2)
  g.translate(depth / 2, 0, 0)
  const s = stud(Math.max(12, Math.round(seg * 0.7)), 0, BRICK, 0.5)
  return merge([g, s])
}

// Tile (placa lisa, sem pinos) — caminho do jardim.
function tile(w, d) {
  const g = new RoundedBoxGeometry(w - 0.06, PLATE, d - 0.06, 2, 0.07)
  g.translate(0, PLATE / 2, 0)
  g.deleteAttribute('uv')
  return g
}

export function buildGeometries(seg = 24) {
  return {
    roundBrick: roundPiece(BRICK, seg),
    roundPlate: roundPiece(PLATE, seg),
    cone: cone(seg),
    bar3: bar(3, seg),
    bar2: bar(2, seg),
    petalS: curvedPlate({ length: 2.4, width: 2.2, bend: 0.3, cup: 0.2, tip: 0.25, seg }),
    petalL: curvedPlate({ length: 3.4, width: 3.0, bend: 0.26, cup: 0.12, tip: 0.3, seg }),
    petalT: curvedPlate({ length: 3.1, width: 2.3, bend: -0.06, cup: 0.3, tip: 0.45, seg }),
    leaf: curvedPlate({ length: 5.2, width: 2.9, bend: 0.16, cup: 0.14, tip: 0.05, twist: 0.5, seg }),
    tile2x2: tile(2, 2, seg),
    slope: slope(seg),
    brick2x4: brick(4, 2, BRICK, seg),
    brick1x4: brick(4, 1, BRICK, seg),
    plate2x2: brick(2, 2, PLATE, seg),
  }
}

// Pino isolado de baixo custo para a placa-base do jardim.
export function baseStud() {
  return stud(12, 0, 0, 0)
}
