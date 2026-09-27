import { useMemo, useEffect, useRef, Suspense } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, DepthOfField, Vignette, Noise, ToneMapping, SMAA } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { buildGeometries } from '../bricks/geometry.js'
import { createABS } from '../bricks/material.js'
import { state, smooth, invLerp, lerp } from '../store.js'
import CameraRig, { focus } from './CameraRig.jsx'
import Stage from './Stage.jsx'
import HeroFlower from './HeroFlower.jsx'
import Garden from './Garden.jsx'
import Bouquet from './Bouquet.jsx'

function Effects({ tier }) {
  const dof = useRef()
  useFrame(() => {
    if (!dof.current) return
    dof.current.target.copy(focus)
    // desfoque mais presente nos closes, quase nada no jardim aberto
    const P = state.p
    const close = 1 - smooth(invLerp(0.46, 0.56, P)) * (1 - smooth(invLerp(0.84, 0.9, P)))
    dof.current.bokehScale = lerp(1.2, 3.2, close)
  })
  return (
    <EffectComposer multisampling={tier.dof ? 4 : 2} enableNormalPass={false}>
      {tier.dof ? <DepthOfField ref={dof} target={[0, 0, 0]} worldFocusRange={26} bokehScale={2.5} resolutionScale={0.5} /> : <></>}
      <Vignette offset={0.28} darkness={0.42} />
      <Noise premultiply opacity={0.12} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  )
}

function Ready() {
  const frames = useRef(0)
  useFrame(() => {
    frames.current++
    if (frames.current === 3) {
      state.ready = true
      window.dispatchEvent(new Event('jardim:ready'))
    }
  })
  return null
}

export default function Scene({ tier, projects }) {
  const geos = useMemo(() => buildGeometries(tier.seg), [tier.seg])
  // o jardim é visto de mais longe: versão mais leve das mesmas peças
  const geosLow = useMemo(() => buildGeometries(Math.max(12, tier.seg - 10)), [tier.seg])
  const material = useMemo(() => createABS(), [])

  return (
    <>
      <CameraRig />
      <Stage shadowSize={tier.shadow} materials={[material]} />
      <HeroFlower geos={geos} material={material} decoys={tier.flowers > 60 ? 60 : 36} />
      <Garden geos={geosLow} material={material} tier={tier} projects={projects} />
      <Bouquet geos={geos} material={material} />
      {tier.post && <Effects tier={tier} />}
      <Ready />
    </>
  )
}
