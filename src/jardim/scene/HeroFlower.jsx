import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { PartBatch } from '../bricks/PartBatch.js'
import { buildHero } from '../bricks/flowers.js'
import { C } from '../bricks/material.js'
import { state, clamp, lerp, easeInOutCubic, easeOutCubic, smooth, rng, CH } from '../store.js'
import { click } from '../lib/audio.js'

const TYPES = ['roundBrick', 'roundPlate', 'cone', 'bar3', 'petalS', 'petalL', 'slope', 'leaf', 'petalT']
const COLORS = [C.pink, C.orange, C.yellow, C.leaf, C.sage, C.coral, C.pinkHot, C.lime, C.white, C.blush]

const _m = new THREE.Matrix4()
const _p = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _up = new THREE.Vector3()
const _axis = new THREE.Vector3()

export const HERO_TOP = new THREE.Vector3(0, 22, 0)

// Peças soltas → caule → flor. Cada peça tem uma pose "solta" que flutua no escuro e
// uma pose "montada". O scroll interpola entre elas; o encaixe final desce pelo eixo do
// pino e dispara um "estalo" (squash elástico + clique) medido em tempo real.
export default function HeroFlower({ geos, material, decoys = 90 }) {
  const batch = useMemo(() => {
    const parts = buildHero()
    const r = rng(42)
    // peças-isca: flutuam no escuro e se dispersam quando a luz acende
    for (let i = 0; i < decoys; i++) {
      parts.push({
        type: TYPES[Math.floor(r() * TYPES.length)],
        color: COLORS[Math.floor(r() * COLORS.length)],
        matrix: new THREE.Matrix4(),
        role: 'decoy',
        order: 999,
      })
    }
    const b = new PartBatch(parts, geos, material)

    const stemParts = parts.filter((p) => p.role === 'stem' || p.role === 'leaf')
    const headParts = parts.filter((p) => ['sepal', 'center', 'petal'].includes(p.role))
    // caule: de baixo para cima, folhas encaixam logo depois do seu nó
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
      // pose solta: uma casca em volta do centro da cena escura
      const th = r() * Math.PI * 2
      const rad = 4 + Math.pow(r(), 0.8) * (p.role === 'decoy' ? 20 : 12)
      p.sp = new THREE.Vector3(Math.cos(th) * rad * 1.3, 13 + (r() - 0.5) * 20, Math.sin(th) * rad * 0.9 - 8)
      p.sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6))
      p.axis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
      p.spin = 0.15 + r() * 0.4
      p.phase = r() * 10
      p.snapAt = -1
      p.wasSnapped = false
      if (p.role === 'decoy') {
        p.t0 = 0.1 + r() * 0.08
        p.dir = p.sp.clone().sub(new THREE.Vector3(0, 13, 0)).normalize()
        p.tp.set(0, 0, 0)
        p.ts.set(1, 1, 1)
      }
    }
    // ordem de montagem → posição na espiral de "bandeja de peças"
    const real = parts.filter((p) => p.role !== 'decoy').sort((a, b) => a.t0 - b.t0)
    real.forEach((p, i) => {
      p.f = i / (real.length - 1)
      p.theta = i * 2.39996
      p.R = 5 + (i % 3) * 0.9
    })
    state.heroCount = parts.length - decoys
    return b
  }, [geos, material, decoys])

  useEffect(() => () => batch.dispose(), [batch])

  const group = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const P = state.p
    // a câmera já passou pela flor: sai do render
    batch.group.visible = P < 0.72
    if (!batch.group.visible) return
    let snapped = 0
    const now = performance.now()

    for (const p of batch.parts) {
      // pose solta, com deriva
      const drift = t * p.spin
      _p.copy(p.sp)
      _p.x += Math.sin(t * 0.3 + p.phase) * 0.6
      _p.y += Math.sin(t * 0.45 + p.phase * 1.3) * 0.8
      _q.setFromAxisAngle(p.axis, drift).premultiply(p.sq)
      _s.set(1, 1, 1)

      if (p.role === 'decoy') {
        // espalham-se para fora e somem
        const a = clamp((P - p.t0) / 0.14)
        const e = a * a
        _p.addScaledVector(p.dir, e * 45)
        _p.y -= e * 10
        const k = 1 - smooth(clamp((a - 0.6) / 0.4))
        _s.setScalar(k)
        _m.compose(_p, _q, _s)
        batch.set(p, _m)
        continue
      }

      // luz acende: o caos se organiza numa espiral em volta da flor
      const g = smooth(clamp((P - 0.08 - p.f * 0.02) / 0.06))
      if (g > 0) {
        const th = p.theta + t * 0.12
        _axis.set(Math.cos(th) * p.R, lerp(1.5, 27, p.f) + Math.sin(t * 0.7 + p.phase) * 0.35, Math.sin(th) * p.R)
        _p.lerp(_axis, g)
      }

      const a = clamp((P - p.t0) / p.dur)
      if (a > 0) {
        const fly = easeInOutCubic(clamp(a / 0.72))
        const settle = smooth(clamp((a - 0.62) / 0.38))
        _up.set(0, 1, 0).applyQuaternion(p.tq)
        const lift = 2.4 * (1 - settle)
        // ponto acima do encaixe, depois desce pelo eixo do pino
        _p.lerp(_axis.copy(p.tp).addScaledVector(_up, lift), fly)
        _q2.copy(p.tq)
        _q.slerp(_q2, easeOutCubic(clamp(a / 0.8)))
      }

      const snappedNow = a >= 1
      if (snappedNow && !p.wasSnapped) {
        p.snapAt = now
        if (Math.abs(state.velocity) < 3) click({ pitch: p.role === 'stem' ? 0.8 : 1.2 })
      }
      p.wasSnapped = snappedNow
      if (snappedNow) snapped++

      // squash elástico de encaixe (tempo real, não scroll)
      _s.copy(p.ts)
      if (p.snapAt > 0) {
        const dt = (now - p.snapAt) / 1000
        if (dt < 0.6) {
          const k = Math.exp(-dt * 9) * Math.cos(dt * 38) * 0.14
          _s.y *= 1 - k
          _s.x *= 1 + k * 0.5
          _s.z *= 1 + k * 0.5
        }
      }
      _m.compose(_p, _q, _s)
      batch.set(p, _m)
    }
    batch.commit()
    state.heroSnapped = snapped

    // a flor montada gira devagar para se mostrar
    if (group.current) {
      const show = clamp((P - CH.stem[0]) / (CH.reveal[1] - CH.stem[0]))
      group.current.rotation.y = Math.sin(t * 0.25) * 0.04 * show + show * 0.9
    }
  })

  return (
    <group ref={group} position={[0, 0.4, 0]}>
      <primitive object={batch.group} />
    </group>
  )
}
