import { useMemo, useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { PartBatch } from '../bricks/PartBatch.js'
import { buildFlower, buildRosette, HEAD_PALETTES } from '../bricks/flowers.js'
import { baseStud, BRICK, PLATE } from '../bricks/geometry.js'
import { C, createABS } from '../bricks/material.js'
import { state, clamp, rng, easeOutBack, smooth, invLerp } from '../store.js'
import { click } from '../lib/audio.js'

// Canteiros: placas-base com pinos. Os de projeto ganham jardineiras de tijolos.
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

// quando algo em z "brota": perto da flor-herói durante a revelação;
// depois, ~45 unidades à frente da câmera.
function zTrigger(z) {
  if (z > -34) return 0.49 + (Math.max(0, -z) / 34) * 0.06
  return 0.62 + (-40 - z) / 560
}

const PLANTER_H = BRICK * 2

function bedTrigger(bed) {
  if (bed.hero) return 0.47
  return zTrigger(bed.z + bed.d / 2)
}

const _m = new THREE.Matrix4()
const _f = new THREE.Matrix4()
const _t = new THREE.Matrix4()
const _s = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _v = new THREE.Vector3()
const _one = new THREE.Vector3(1, 1, 1)

export default function Garden({ geos, material, tier, projects = [] }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const data = useMemo(() => {
    const r = rng(1234)
    const beds = BEDS.filter((b) => !(b.far && tier.bed < 0.8))
    const flowers = []
    const parts = []
    const planterParts = []
    const studs = []
    const slabs = []
    const budget = tier.flowers / 150

    for (const bed of beds) {
      const top = bed.project != null ? PLANTER_H : PLATE
      bed.top = top
      bed.t0 = bedTrigger(bed)
      // placa-base
      const inset = bed.project != null ? 1 : 0
      const sw = bed.w - inset * 2
      const sd = bed.d - inset * 2
      slabs.push({ x: bed.x, z: bed.z, w: sw, d: sd, y: top - PLATE, color: bed.project != null ? C.sageDark : C.sage, bed })
      for (let i = 0; i < sw; i++)
        for (let j = 0; j < sd; j++)
          studs.push({ x: bed.x - sw / 2 + 0.5 + i, y: top, z: bed.z - sd / 2 + 0.5 + j, bed, c: bed.project != null ? C.sageDark : C.sage })

      // jardineira de tijolos 1×4 (duas fiadas)
      if (bed.project != null) {
        const cols = [C.terracotta, C.tan, C.cream]
        for (let layer = 0; layer < 2; layer++) {
          const y = layer * BRICK
          const nx = bed.w / 4
          for (let i = 0; i < nx; i++) {
            for (const side of [-1, 1]) {
              const m = new THREE.Matrix4().makeTranslation(bed.x - bed.w / 2 + 2 + i * 4, y, bed.z + side * (bed.d / 2 - 0.5))
              planterParts.push({ type: 'brick1x4', color: cols[(i + layer + (side > 0 ? 1 : 0)) % 3], matrix: m, bed, order: layer })
            }
          }
          const nz = Math.floor((bed.d - 2) / 4)
          for (let i = 0; i < nz; i++) {
            for (const side of [-1, 1]) {
              const m = new THREE.Matrix4()
                .makeTranslation(bed.x + side * (bed.w / 2 - 0.5), y, bed.z - (bed.d - 2) / 2 + 2 + i * 4)
                .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
              planterParts.push({ type: 'brick1x4', color: cols[(i + layer + 2) % 3], matrix: m, bed, order: layer })
            }
          }
          // cantos 1x... preenchidos com tijolos redondos
          for (const sx of [-1, 1])
            for (const sz of [-1, 1]) {
              const m = new THREE.Matrix4().makeTranslation(bed.x + sx * (bed.w / 2 - 0.5), y, bed.z + sz * (bed.d / 2 - 0.5))
              if (layer === 0 || true) planterParts.push({ type: 'roundBrick', color: C.cream, matrix: m, bed, order: layer, corner: true })
            }
        }
      }

      // flores em posições da grade de pinos, com espaçamento mínimo
      const n = Math.max(1, Math.round(bed.n * budget))
      const placed = []
      let tries = 0
      while (placed.length < n && tries++ < 400) {
        const gx = Math.floor(r() * (sw - 2)) + 1
        const gz = Math.floor(r() * (sd - 2)) + 1
        const x = bed.x - sw / 2 + 0.5 + gx
        const z = bed.z - sd / 2 + 0.5 + gz
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
        const fp = buildFlower({ kind, height, rand: r, head, lean: 0.1 + r() * 0.1 })
        const flower = {
          x: pl.x,
          z: pl.z,
          y: top,
          rotY: r() * Math.PI * 2,
          phase: r() * 10,
          t0: bed.t0 + r() * 0.02,
          span: 0.028,
          parts: fp,
          F: new THREE.Matrix4(),
        }
        fp.forEach((p, i) => {
          p.flower = flower
          p.k = i / fp.length
        })
        flowers.push(flower)
        parts.push(...fp)
      }
      // forração: rosetas de folhas entre as flores
      const nr = Math.round(((sw * sd) / 22) * tier.bed)
      for (let i = 0; i < nr; i++) {
        const x = bed.x - sw / 2 + 1.5 + Math.floor(r() * (sw - 3))
        const z = bed.z - sd / 2 + 1.5 + Math.floor(r() * (sd - 3))
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 1.6)) continue
        if (bed.hero && Math.hypot(x, z) < 2.5) continue
        const rp = buildRosette(r, r() < 0.5 ? C.leaf : C.sageDark)
        const flower = { x, z, y: top, rotY: r() * 6.28, phase: r() * 10, t0: bed.t0 + 0.004 + r() * 0.01, span: 0.012, parts: rp, F: new THREE.Matrix4() }
        rp.forEach((p, k) => {
          p.flower = flower
          p.k = k / rp.length
        })
        flowers.push(flower)
        parts.push(...rp)
      }
    }

    // peças que sobraram na mesa: detalhe de quem está montando
    const LEFT = ['petalS', 'roundPlate', 'slope', 'bar2', 'plate2x2', 'cone', 'roundBrick', 'petalL']
    const LCOL = [C.pink, C.orange, C.yellow, C.leaf, C.white, C.coral, C.lilac, C.lime]
    const nLeft = Math.round(70 * tier.bed)
    for (let i = 0; i < nLeft; i++) {
      const z = 8 - r() * 160
      const side = r() < 0.5 ? -1 : 1
      const x = side * (2.8 + r() * 3.4)
      const type = LEFT[Math.floor(r() * LEFT.length)]
      const flat = type === 'bar2' ? new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 0.2, 0) : new THREE.Matrix4()
      const m = new THREE.Matrix4().makeRotationY(r() * 6.28).setPosition(x, 0, z).multiply(flat)
      planterParts.push({ type, color: LCOL[Math.floor(r() * LCOL.length)], matrix: m, bed: { t0: zTrigger(z) + 0.005 }, order: 0 })
    }

    // caminho de tiles entre os canteiros
    const pathCols = [C.cream, C.tan, C.white, C.cream]
    for (let z = -7; z > -160; z -= 2) {
      for (const x of [-1, 1]) {
        const jitter = (r() - 0.5) * 0.06
        const m = new THREE.Matrix4().makeRotationY(jitter).setPosition(x, 0, z)
        planterParts.push({ type: 'tile2x2', color: pathCols[Math.floor(r() * pathCols.length)], matrix: m, bed: { t0: zTrigger(z) - 0.01 }, order: 0 })
      }
    }

    const batch = new PartBatch(parts, geos, material)
    const planters = planterParts.length ? new PartBatch(planterParts, geos, material) : null

    // pinos das placas-base: um InstancedMesh só
    const studGeo = baseStud()
    const studMesh = new THREE.InstancedMesh(studGeo, material, studs.length)
    studMesh.castShadow = false
    studMesh.receiveShadow = true
    studMesh.frustumCulled = false
    const col = new THREE.Color()
    studs.forEach((s, i) => {
      studMesh.setMatrixAt(i, _m.makeTranslation(s.x, s.y, s.z))
      studMesh.setColorAt(i, col.set(s.c))
    })
    studMesh.instanceColor.needsUpdate = true

    // placas-base: uma malha por canteiro para poder brotar junto com as flores
    const slabMat = createABS({ sss: 0.08 })
    const slabMeshes = slabs.map((sl) => {
      const g = new RoundedBoxGeometry(sl.w - 0.04, PLATE, sl.d - 0.04, 1, 0.06)
      g.translate(0, PLATE / 2, 0)
      const mat = slabMat.clone()
      mat.onBeforeCompile = slabMat.onBeforeCompile
      mat.userData = slabMat.userData
      mat.customProgramCacheKey = slabMat.customProgramCacheKey
      mat.color.set(sl.color)
      const mesh = new THREE.Mesh(g, mat)
      mesh.position.set(sl.x, sl.y, sl.z)
      mesh.receiveShadow = true
      mesh.castShadow = true
      mesh.userData.bed = sl.bed
      return mesh
    })
    const slabGroup = new THREE.Group()
    slabMeshes.forEach((m) => slabGroup.add(m))

    const labels = beds
      .filter((b) => b.project != null)
      .map((b) => ({
        bed: b,
        pos: new THREE.Vector3(b.x, 16, b.z),
        index: b.project,
      }))
    state.labels = labels
    state.gardenCount = parts.length + planterParts.length
    return { flowers, batch, planters, studMesh, slabGroup, slabMeshes, beds, studs, labels, lastP: -1 }
  }, [geos, material, tier.flowers, tier.bed])

  useEffect(
    () => () => {
      data.batch.dispose()
      data.planters?.dispose()
      data.studMesh.dispose()
    },
    [data],
  )

  const root = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const P = state.p
    let grown = 0
    if (root.current) root.current.visible = P > 0.07
    const now = performance.now()

    // plantas: brotam peça por peça, de baixo para cima
    for (const fl of data.flowers) {
      const g0 = (P - fl.t0) / fl.span
      const sway = clamp(g0 - 1, 0, 1)
      _e.set(Math.sin(t * 0.9 + fl.phase) * 0.025 * sway, fl.rotY, Math.cos(t * 0.7 + fl.phase) * 0.025 * sway, 'YXZ')
      _q.setFromEuler(_e)
      fl.F.compose(_v.set(fl.x, fl.y, fl.z), _q, _one)
      for (const p of fl.parts) {
        const a = clamp((g0 - p.k * 0.75) / 0.25)
        if (a <= 0) {
          _m.makeScale(0, 0, 0)
          if (p.was) p.was = false
        } else {
          const s = easeOutBack(a, 2.2)
          const drop = (1 - smooth(a)) * 1.6
          _t.makeTranslation(0, drop, 0)
          _s.makeScale(s, s, s)
          _m.multiplyMatrices(fl.F, _t).multiply(p.matrix).multiply(_s)
          if (a >= 1) {
            grown++
            if (!p.was) {
              p.was = true
              if (Math.random() < 0.08 && Math.abs(state.velocity) < 3) click({ pitch: 1.4, gain: 0.25 })
            }
          }
        }
        data.batch.set(p, _m)
      }
    }
    data.batch.commit()

    if (data.planters) {
      for (const p of data.planters.parts) {
        const a = clamp((P - p.bed.t0 + 0.012 - p.order * 0.006) / 0.012)
        if (a <= 0) _m.makeScale(0, 0, 0)
        else {
          const s = easeOutBack(a, 1.6)
          _t.makeTranslation(0, (1 - smooth(a)) * 3, 0)
          _m.multiplyMatrices(_t, p.matrix).multiply(_s.makeScale(1, s, 1))
          if (a >= 1) grown++
        }
        data.planters.set(p, _m)
      }
      data.planters.commit()
    }
    state.gardenGrown = grown

    // placas-base e pinos: sobem do chão quando o canteiro brota
    if (Math.abs(P - data.lastP) > 1e-5) {
      data.lastP = P
      const bedA = (bed) => clamp((P - bed.t0 + 0.02) / 0.014)
      for (const m of data.slabMeshes) {
        const a = bedA(m.userData.bed)
        m.visible = a > 0
        const s = easeOutBack(a, 1.4)
        m.scale.set(Math.max(0.001, s), Math.max(0.001, a), Math.max(0.001, s))
      }
      for (let i = 0; i < data.studs.length; i++) {
        const st = data.studs[i]
        const a = clamp((bedA(st.bed) - 0.5 - ((i * 7) % 13) / 26) * 4)
        if (a <= 0) _m.makeScale(0, 0, 0)
        else _m.makeScale(a, a, a).setPosition(st.x, st.y, st.z)
        data.studMesh.setMatrixAt(i, _m)
      }
      data.studMesh.instanceMatrix.needsUpdate = true
    }

    // rótulos dos projetos: projeção manual para o DOM (sem re-render)
    const els = state.labelEls || []
    for (let i = 0; i < data.labels.length; i++) {
      const L = data.labels[i]
      const el = els[L.index]
      if (!el) continue
      _v.copy(L.pos).project(camera)
      const vis = smooth(invLerp(L.bed.t0 + 0.02, L.bed.t0 + 0.05, P)) * (1 - smooth(invLerp(0.84, 0.88, P)))
      const behind = _v.z > 1
      const x = (_v.x * 0.5 + 0.5) * size.width
      const y = (-_v.y * 0.5 + 0.5) * size.height
      const edge = Math.min(1, Math.min(x, size.width - x) / 120, Math.min(y, size.height - y) / 100)
      const o = behind ? 0 : vis * clamp(edge)
      el.style.opacity = o.toFixed(3)
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      el.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
    }
  })

  return (
    <group ref={root}>
      <primitive object={data.batch.group} />
      {data.planters && <primitive object={data.planters.group} />}
      <primitive object={data.studMesh} />
      <primitive object={data.slabGroup} />
    </group>
  )
}
