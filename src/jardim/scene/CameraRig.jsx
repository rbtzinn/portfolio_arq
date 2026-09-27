import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { state, clamp, damp } from '../store.js'
import { isMobile } from '../bricks/quality.js'

// Trilha de câmera: [progresso, posição, alvo]. Tudo derivado do scroll.
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
  [0.8, [5, 15, -82], [-3, 8, -112]],
  [0.86, [-1, 17, -114], [-2, 11, -160]],
  [0.92, [6, 19, -119], [-6, 12, -165]],
  [1.0, [4, 18, -117], [-7, 11.5, -165]],
]

export const focus = new THREE.Vector3()

export default function CameraRig() {
  const { camera, size } = useThree()
  const { posCurve, tgtCurve, ps } = useMemo(() => {
    const posCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[1])), false, 'centripetal')
    const tgtCurve = new THREE.CatmullRomCurve3(KEYS.map((k) => new THREE.Vector3(...k[2])), false, 'centripetal')
    return { posCurve, tgtCurve, ps: KEYS.map((k) => k[0]) }
  }, [])

  const tmp = useMemo(
    () => ({ pos: new THREE.Vector3(), tgt: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() }),
    [],
  )

  useFrame((_, dt) => {
    dt = Math.min(dt, 0.05)
    state.p = damp(state.p, state.progress, 7, dt)
    const pt = state.pointer
    const gx = state.gyro.enabled ? state.gyro.x : pt.x
    const gy = state.gyro.enabled ? state.gyro.y : pt.y
    pt.sx = damp(pt.sx, gx, 3, dt)
    pt.sy = damp(pt.sy, gy, 3, dt)

    const P = clamp(state.p)
    let i = 0
    while (i < ps.length - 2 && P > ps[i + 1]) i++
    const local = clamp((P - ps[i]) / (ps[i + 1] - ps[i]))
    const u = (i + local) / (ps.length - 1)
    posCurve.getPoint(u, tmp.pos)
    tgtCurve.getPoint(u, tmp.tgt)

    // retrato: afasta a câmera para caber a flor alta
    const aspect = size.width / size.height
    if (aspect < 1) {
      const k = 1 - aspect
      // no retrato o texto fica embaixo: centraliza o assunto e o sobe no quadro
      const center = clamp((P - 0.84) / 0.06)
      tmp.tgt.x *= 1 - center * 0.85
      tmp.pos.x *= 1 - center * 0.6
      const pull = 1 + k * (0.55 - center * 0.25)
      tmp.pos.sub(tmp.tgt).multiplyScalar(pull).add(tmp.tgt)
      tmp.tgt.y -= k * 5
    }

    // paralaxe do ponteiro / giroscópio
    camera.position.copy(tmp.pos)
    camera.lookAt(tmp.tgt)
    tmp.right.setFromMatrixColumn(camera.matrixWorld, 0)
    tmp.up.setFromMatrixColumn(camera.matrixWorld, 1)
    const amp = isMobile ? 1.4 : 1.8
    camera.position.addScaledVector(tmp.right, pt.sx * amp).addScaledVector(tmp.up, pt.sy * amp * 0.6)
    camera.lookAt(tmp.tgt)

    const fov = aspect < 1 ? 46 : 34
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    focus.copy(tmp.tgt)
  }, -1)
  return null
}
