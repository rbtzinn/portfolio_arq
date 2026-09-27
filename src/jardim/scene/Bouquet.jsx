import { useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PartBatch } from '../bricks/PartBatch.js'
import { buildFlower } from '../bricks/flowers.js'
import { BRICK, PLATE } from '../bricks/geometry.js'
import { C } from '../bricks/material.js'
import { state, clamp, rng, easeInOutCubic, smooth, invLerp, easeOutBack } from '../store.js'
import { click, scatterSound } from '../lib/audio.js'

export const BOUQUET_POS = new THREE.Vector3(0, 0, -165)
const PED_H = BRICK * 4
const GRAV = 30

const _m = new THREE.Matrix4()
const _r = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _dq = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _v = new THREE.Vector3()
const _one = new THREE.Vector3(1, 1, 1)

// Explode / remonta. Chamado pela interface (clique, toque ou chacoalhar).
export function toggleBouquet() {
  const b = state.bouquet
  if (b.mode === 'idle') b.request = 'explode'
  else b.request = 'return'
}

export default function Bouquet({ geos, material }) {
  const data = useMemo(() => {
    const r = rng(99)
    const parts = []
    const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z)

    // pedestal: fiadas de 2×4 cruzadas — a coluna do arquiteto
    for (let l = 0; l < 4; l++) {
      const rotd = l % 2 ? Math.PI / 2 : 0
      for (const o of [-1, 1]) {
        const off = new THREE.Vector3(0, 0, o).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotd)
        const m = T(off.x, l * BRICK, off.z).multiply(new THREE.Matrix4().makeRotationY(rotd))
        parts.push({ type: 'brick2x4', color: l % 2 ? C.white : C.cream, matrix: m, role: 'pedestal' })
      }
    }
    // vaso: anéis de tijolos redondos
    const vaseY = PED_H
    const ringN = 9
    for (let l = 0; l < 3; l++) {
      const R = 1.55 + l * 0.18
      for (let i = 0; i < ringN; i++) {
        const a = (i / ringN) * Math.PI * 2 + l * 0.35
        const m = T(Math.cos(a) * R, vaseY + l * BRICK, Math.sin(a) * R)
        parts.push({ type: 'roundBrick', color: (i + l) % 3 === 0 ? C.blush : C.terracotta, matrix: m, role: 'vase' })
      }
    }
    // flores do buquê, abrindo em leque a partir do vaso
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
      const fp = buildFlower({
        kind,
        height: h,
        rand: r,
        head,
        lean: 0.05,
        leaves: [{ node: 2, angle: dir + 0.5, pitch: 0.5, scale: 0.8 }],
      })
      const base = T(Math.cos(dir) * 0.5 * (tilt > 0 ? 1 : 0), vaseY + 0.4, Math.sin(dir) * 0.5 * (tilt > 0 ? 1 : 0)).multiply(
        new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(Math.sin(dir), 0, -Math.cos(dir)).normalize(), -tilt),
      )
      for (const p of fp) {
        p.matrix.premultiply(base)
        p.role = 'flower'
        parts.push(p)
      }
    }
    parts.forEach((p, i) => {
      p.order = i
      p.pos = new THREE.Vector3()
      p.quat = new THREE.Quaternion()
      p.vel = new THREE.Vector3()
      p.w = new THREE.Vector3()
      p.from = new THREE.Vector3()
      p.fromQ = new THREE.Quaternion()
      p.delay = 0
      p.spins = p.role !== 'pedestal'
      p.flies = p.role !== 'pedestal'
    })
    const batch = new PartBatch(parts, geos, material)
    state.bouquetCount = parts.length
    return { batch, parts }
  }, [geos, material])

  useEffect(() => () => data.batch.dispose(), [data])

  useFrame(({ clock }, dt) => {
    dt = Math.min(dt, 1 / 30)
    const B = state.bouquet
    const P = state.p
    const t = clock.elapsedTime
    const now = performance.now()

    // chegada: o buquê se monta rapidamente quando a câmera se aproxima
    const arrive = clamp(invLerp(0.8, 0.9, P))
    data.batch.group.visible = P > 0.76

    // giro: automático + arraste com inércia
    B.spinVel *= Math.exp(-dt * 2.5)
    B.spin += dt * 0.22 + B.spinVel * dt
    _r.makeRotationY(B.spin + P * 3)

    if (B.request === 'explode' && B.mode === 'idle') {
      B.request = null
      B.mode = 'exploded'
      B.changedAt = now
      for (const p of data.parts) {
        if (!p.flies) continue
        _m.multiplyMatrices(_r, p.matrix).decompose(p.pos, p.quat, _s)
        _v.set(p.pos.x, 0, p.pos.z)
        if (_v.lengthSq() < 0.01) _v.set(Math.random() - 0.5, 0, Math.random() - 0.5)
        _v.normalize()
        const f = 6 + Math.random() * 13
        p.vel.set(_v.x * f, 6 + Math.random() * 14 + (p.pos.y - PED_H) * 0.5, _v.z * f)
        p.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 9)
        p.rest = false
      }
      scatterSound(26)
    } else if (B.request === 'return' && B.mode === 'exploded') {
      B.request = null
      B.mode = 'returning'
      B.changedAt = now
      const flying = data.parts.filter((p) => p.flies)
      flying.forEach((p, i) => {
        p.from.copy(p.pos)
        p.fromQ.copy(p.quat)
        p.delay = (i / flying.length) * 1.3 + Math.random() * 0.15
        p.snapped = false
      })
    } else B.request = null

    const sinceChange = (now - B.changedAt) / 1000
    let allBack = true

    for (const p of data.parts) {
      if (B.mode === 'exploded' && p.flies) {
        if (!p.rest) {
          p.vel.y -= GRAV * dt
          p.pos.addScaledVector(p.vel, dt)
          _dq.setFromAxisAngle(_v.copy(p.w).normalize(), p.w.length() * dt)
          p.quat.premultiply(_dq)
          const onPed = Math.abs(p.pos.x) < 2 && Math.abs(p.pos.z) < 2
          const floor = onPed ? PED_H + 0.25 : 0.3
          if (p.pos.y < floor && p.vel.y < 0) {
            p.pos.y = floor
            p.vel.y *= -0.32
            p.vel.x *= 0.55
            p.vel.z *= 0.55
            p.w.multiplyScalar(0.5)
            if (Math.abs(p.vel.y) < 1.2) {
              p.vel.set(0, 0, 0)
              p.rest = true
            }
          }
        }
        _m.compose(p.pos, p.quat, _one)
      } else if (B.mode === 'returning' && p.flies) {
        const a = clamp((sinceChange - p.delay) / 0.9)
        _m.multiplyMatrices(_r, p.matrix).decompose(_p, _q, _s)
        const e = easeInOutCubic(a)
        const lift = Math.sin(Math.PI * e) * 3.5
        _p.lerpVectors(p.from, _p, e)
        _p.y += lift
        _q.slerpQuaternions(p.fromQ, _q, smooth(a))
        _m.compose(_p, _q, _s)
        if (a >= 1 && !p.snapped) {
          p.snapped = true
          click({ pitch: 0.9 + Math.random() * 0.5, gain: 0.4 })
        }
        if (a < 1) allBack = false
      } else {
        // montado: aparece em sequência na chegada
        const k = p.order / data.parts.length
        const a = clamp((arrive - k * 0.7) / 0.3)
        if (a <= 0) _m.makeScale(0, 0, 0)
        else {
          const s = easeOutBack(a, 1.8)
          _m.multiplyMatrices(p.spins ? _r : _m.identity(), p.matrix)
          if (a < 1) {
            _m.decompose(_p, _q, _s)
            _p.y += (1 - smooth(a)) * 2.5
            _m.compose(_p, _q, _s.multiplyScalar(s))
          }
        }
      }
      data.batch.set(p, _m)
    }
    if (B.mode === 'returning' && allBack) B.mode = 'idle'
    data.batch.commit()
    state.bouquetAssembled = B.mode === 'idle' ? Math.round(arrive * data.parts.length) : 0
  })

  return (
    <group position={BOUQUET_POS.toArray()}>
      <primitive object={data.batch.group} />
    </group>
  )
}
