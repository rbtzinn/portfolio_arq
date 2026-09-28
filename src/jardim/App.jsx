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
  const [mountBouquet, setMountBouquet] = useState(false)
  const onManifest = useCallback((m, variant) => {
    setFinal(m.final[variant])
  }, [])

  // o 3D do buquê só é montado perto do fim (a montagem custa CPU; no início do scroll
  // isso viraria travada). No desktop, também quando o navegador fica ocioso após carregar.
  useEffect(() => {
    let raf
    const fine = matchMedia('(pointer: fine)').matches
    const loaded = () => fine && (window.requestIdleCallback || setTimeout)(() => setMountBouquet(true), { timeout: 4000 })
    const watch = () => {
      if (state.p > 0.68) setMountBouquet(true)
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
      <Overlay projects={list} />
      <div className="hero-space" aria-hidden="true" />
      <div ref={track} className="track" aria-hidden="true" />
    </>
  )
}
