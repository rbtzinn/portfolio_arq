import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import gsap from 'gsap'
import Bouquet, { BOUQUET_POS, PED_H } from './Bouquet.jsx'
import { buildGeometries } from '../bricks/geometry.js'
import { createABS } from '../bricks/material.js'
import { state, smooth, invLerp } from '../store.js'
import { isMobile } from '../bricks/quality.js'

// O buquê é a única parte em tempo real: é composto sobre o último frame da sequência
// (o "plate" renderizado no Blender), com a MESMA câmera. O pedestal do plate vira um
// oclusor invisível e o chão só recebe sombra — as peças caem "dentro" da imagem.

// Ajusta o fov ao recorte "cover" que o canvas 2D aplica ao plate.
function PlateCamera({ cam }) {
  const { camera, size } = useThree()
  useFrame(() => {
    const va = size.width / size.height
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (va > cam.aspect ? cam.aspect / va : 1)
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalf))
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    camera.position.set(...cam.pos)
    camera.lookAt(...cam.tgt)
  }, -1)
  return null
}

function Catchers() {
  const occ = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ colorWrite: false })
    return m
  }, [])
  return (
    <group position={BOUQUET_POS.toArray()}>
      {/* pedestal do plate: escreve só profundidade */}
      <mesh material={occ} position={[0, PED_H / 2, 0]} renderOrder={-1}>
        <boxGeometry args={[3.96, PED_H, 3.96]} />
      </mesh>
      {/* chão e topo do pedestal: só sombra */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <shadowMaterial transparent opacity={0.22} color="#5b4630" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, PED_H + 0.19, 0]} receiveShadow>
        <planeGeometry args={[3.96, 3.96]} />
        <shadowMaterial transparent opacity={0.25} color="#5b4630" />
      </mesh>
    </group>
  )
}

// Luz aproximando o estúdio do Blender: sol-chave de (14, 30, 12), contraluz frio,
// ambiente creme.
function Lights() {
  const key = useRef()
  useEffect(() => {
    key.current.target.position.copy(BOUQUET_POS)
    key.current.target.updateMatrixWorld()
  }, [])
  const p = BOUQUET_POS
  return (
    <>
      <Environment resolution={128} frames={1}>
        <color attach="background" args={['#e9dfcf']} />
        <Lightformer form="rect" intensity={3} color="#fff6ea" position={[0, 12, 2]} rotation-x={Math.PI / 2} scale={[14, 8, 1]} />
        <Lightformer form="rect" intensity={1.4} color="#ffe6cf" position={[-10, 4, 3]} rotation-y={Math.PI / 2} scale={[4, 12, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#e6efff" position={[10, 3, -3]} rotation-y={-Math.PI / 2} scale={[4, 12, 1]} />
      </Environment>
      <hemisphereLight args={['#fff4e2', '#d9ccb4', 0.5]} />
      <directionalLight
        ref={key}
        castShadow
        position={[p.x + 14 * 2, p.y + 30 * 2, p.z + 12 * 2]}
        intensity={2.6}
        color="#fff1dc"
        shadow-mapSize={[isMobile ? 1024 : 2048, isMobile ? 1024 : 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={5}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={10}
        shadow-camera-far={140}
      />
      <directionalLight position={[p.x - 6, p.y + 10, p.z - 16]} intensity={0.7} color="#eef3ff" />
    </>
  )
}

function Content() {
  const geos = useMemo(() => buildGeometries(isMobile ? 18 : 24), [])
  const material = useMemo(() => createABS(), [])
  useEffect(() => {
    window.dispatchEvent(new Event('jardim:bouquet'))
  }, [])
  return (
    <>
      <Lights />
      <Catchers />
      <Bouquet geos={geos} material={material} withPedestal={false} />
    </>
  )
}

export default function BouquetStage({ cam }) {
  const wrap = useRef()
  const [active, setActive] = useState(false)
  useEffect(() => {
    const tick = () => {
      const B = state.bouquet
      // some quando o turntable renderizado assume; dorme (sem render) quando totalmente coberto
      const o = smooth(invLerp(0.86, 0.885, state.p)) * (1 - B.turnAlpha)
      if (wrap.current) wrap.current.style.opacity = o.toFixed(3)
      const covered = B.turnAlpha > 0.995 && B.mode === 'idle' && !B.request
      const on = state.p > 0.82 && !covered
      setActive((a) => (a === on ? a : on))
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])

  return (
    <div ref={wrap} className="bq-stage" aria-hidden="true">
      <Canvas
        shadows="soft"
        frameloop={active ? 'always' : 'never'}
        dpr={[1, isMobile ? 1.75 : 2]}
        gl={{ alpha: true, antialias: true, toneMapping: THREE.NeutralToneMapping, powerPreference: 'high-performance' }}
        camera={{ fov: cam.fov, near: 0.5, far: 400, position: cam.pos }}
        style={{ background: 'transparent' }}
      >
        <PlateCamera cam={cam} />
        <Content />
      </Canvas>
    </div>
  )
}
