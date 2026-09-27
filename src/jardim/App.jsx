import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sequence from './seq/Sequence.jsx'
import Overlay from './ui/Overlay.jsx'
import { setupScroll } from './lib/scroll.js'
import { projects } from '../data/projects.js'
import { useInput } from './lib/input.js'
import { state } from './store.js'

// Three.js só é baixado para o final interativo (buquê).
const BouquetStage = lazy(() => import('./scene/BouquetStage.jsx'))

export default function App() {
  const track = useRef()
  useEffect(() => setupScroll(track.current), [])
  useInput()

  const [final, setFinal] = useState(null)
  const [bom, setBom] = useState(undefined)
  const [mountBouquet, setMountBouquet] = useState(false)
  const onManifest = useCallback((m, variant) => {
    setFinal(m.final[variant])
    setBom(m.bom)
  }, [])

  // monta o buquê quando a sequência terminou de carregar, ou antes se o scroll chegar perto
  useEffect(() => {
    let raf
    const loaded = () => setMountBouquet(true)
    const watch = () => {
      if (state.p > 0.55) setMountBouquet(true)
      else raf = requestAnimationFrame(watch)
    }
    watch()
    window.addEventListener('jardim:loaded', loaded)
    const onBq = () => {
      if (state.seq) state.totalPieces = state.seq.manifest.built.at(-1) + (state.bouquetCount || 0)
    }
    window.addEventListener('jardim:bouquet', onBq)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('jardim:loaded', loaded)
      window.removeEventListener('jardim:bouquet', onBq)
    }
  }, [])

  const list = useMemo(() => projects.slice(0, 4), [])

  return (
    <>
      <div className="stage">
        <Sequence onManifest={onManifest} />
        {final && mountBouquet && (
          <Suspense fallback={null}>
            <BouquetStage cam={final} />
          </Suspense>
        )}
      </div>
      <Overlay projects={list} bom={bom} />
      <div ref={track} className="track" aria-hidden="true" />
    </>
  )
}
