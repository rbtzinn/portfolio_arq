import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { state, smooth, invLerp, lerp } from '../store.js'
import { focus } from './CameraRig.jsx'
import { C } from '../bricks/material.js'

const DARK = new THREE.Color('#0c0b0a')
const CREAM = new THREE.Color(C.cream)
const WARM = new THREE.Color('#efe6d6')

// Estúdio: HDRI gerado por código (Lightformers), luz-chave com sombra que segue a câmera,
// e uma "lanterna" que acompanha o cursor enquanto tudo está no escuro.
export default function Stage({ shadowSize = 2048, materials }) {
  const { scene, camera } = useThree()
  const key = useRef()
  const spot = useRef()
  const hemi = useRef()
  const floorMat = useRef()
  const bg = useMemo(() => new THREE.Color(), [])
  const fog = useMemo(() => new THREE.Fog(DARK, 30, 120), [])
  scene.fog = fog
  scene.background = bg

  useFrame(() => {
    const P = state.p
    const light = smooth(invLerp(0.085, 0.2, P))
    bg.copy(DARK).lerp(CREAM, light)
    fog.color.copy(bg)
    // no escuro, névoa longe; no jardim, névoa atmosférica
    const garden = smooth(invLerp(0.5, 0.62, P))
    fog.near = lerp(40, 55, garden)
    fog.far = lerp(140, 150, garden)
    scene.environmentIntensity = lerp(0.06, 1.0, light)
    if (materials) for (const m of materials) m.userData.uSSS.value = lerp(0.02, m.userData.sssBase ?? 0.14, light)

    if (key.current) {
      key.current.intensity = lerp(0.0, 2.4, light)
      // sombra acompanha o alvo da câmera
      key.current.position.set(focus.x + 14, focus.y + 30, focus.z + 12)
      key.current.target.position.set(focus.x, 0, focus.z - 4)
      key.current.target.updateMatrixWorld()
    }
    if (hemi.current) hemi.current.intensity = lerp(0.0, 0.45, light)
    if (spot.current) {
      const pt = state.pointer
      spot.current.intensity = (1 - light) * 1400
      spot.current.position.set(camera.position.x + pt.sx * 6, camera.position.y + 6 + pt.sy * 4, camera.position.z - 4)
      spot.current.target.position.set(pt.sx * 16, 13 + pt.sy * 9, 0)
      spot.current.target.updateMatrixWorld()
    }
    if (floorMat.current) floorMat.current.color.copy(DARK).lerp(WARM, light)
  })

  return (
    <>
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#d9cdb8']} />
        <Lightformer form="rect" intensity={4} color="#fff6ea" position={[0, 12, 2]} rotation-x={Math.PI / 2} scale={[14, 8, 1]} />
        <Lightformer form="rect" intensity={2} color="#ffe6cf" position={[-10, 4, 3]} rotation-y={Math.PI / 2} scale={[4, 12, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#e6efff" position={[10, 3, -3]} rotation-y={-Math.PI / 2} scale={[4, 12, 1]} />
        <Lightformer form="ring" intensity={2.5} color="#ffffff" position={[0, 3, 12]} scale={5} />
        <Lightformer form="rect" intensity={0.8} color="#b9cbaa" position={[0, -6, 0]} rotation-x={-Math.PI / 2} scale={[30, 30, 1]} />
      </Environment>

      <hemisphereLight ref={hemi} args={['#fff4e2', '#9db48f', 0.4]} />
      <directionalLight
        ref={key}
        castShadow
        intensity={2.4}
        color="#fff1dc"
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-radius={6}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-near={1}
        shadow-camera-far={90}
      />
      <spotLight ref={spot} angle={0.42} penumbra={0.9} distance={90} decay={1.6} color="#ffe2c4" />

      <mesh rotation-x={-Math.PI / 2} position={[0, -0.001, -70]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial ref={floorMat} color={C.cream} roughness={0.92} />
      </mesh>
    </>
  )
}
