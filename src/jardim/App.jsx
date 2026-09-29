import { useEffect, useMemo, useRef } from 'react'
import Scene3D from './scene/Scene3D.jsx'
import Overlay from './ui/Overlay.jsx'
import { setupScroll } from './lib/scroll.js'
import { projects } from '../data/projects.js'
import { useInput } from './lib/input.js'

export default function App() {
  const track = useRef()
  useEffect(() => setupScroll(track.current), [])
  useInput()
  const list = useMemo(() => projects.slice(0, 4), [])

  return (
    <>
      <div className="stage">
        <Scene3D />
      </div>
      <Overlay projects={list} />
      <div className="hero-space" aria-hidden="true" />
      <div ref={track} className="track" aria-hidden="true" />
    </>
  )
}
