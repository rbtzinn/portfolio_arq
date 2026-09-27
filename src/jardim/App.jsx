import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import Scene from './scene/Scene.jsx'
import Overlay from './ui/Overlay.jsx'
import { TIERS, initialTier } from './bricks/quality.js'
import { setupScroll } from './lib/scroll.js'
import { projects } from '../data/projects.js'
import { useInput } from './lib/input.js'

export default function App() {
  const base = TIERS[initialTier]
  const [degrade, setDegrade] = useState(0)
  const tier = useMemo(() => {
    const t = { ...base }
    if (degrade >= 1) {
      t.dof = false
      t.dpr = [Math.min(1, base.dpr[0]), Math.max(1, base.dpr[1] - 0.5)]
    }
    if (degrade >= 2) {
      t.post = false
      t.dpr = [0.75, 1]
    }
    return t
  }, [base, degrade])

  const track = useRef()
  useEffect(() => setupScroll(track.current), [])
  useInput()

  const list = useMemo(() => projects.slice(0, 4), [])

  return (
    <>
      <div className="stage">
        <Canvas
          shadows="soft"
          dpr={tier.dpr}
          gl={{
            antialias: !base.post,
            powerPreference: 'high-performance',
            toneMapping: THREE.NeutralToneMapping,
            toneMappingExposure: 1.0,
            stencil: false,
          }}
          camera={{ fov: 34, near: 0.5, far: 420, position: [0, 13, 36] }}
        >
          <PerformanceMonitor
            flipflops={3}
            bounds={(r) => (r > 90 ? [50, 90] : [28, 50])}
            onDecline={() => setDegrade((d) => Math.min(2, d + 1))}
          />
          <Scene tier={tier} projects={list} />
        </Canvas>
      </div>
      <Overlay projects={list} tier={initialTier} />
      <div ref={track} className="track" aria-hidden="true" />
    </>
  )
}
