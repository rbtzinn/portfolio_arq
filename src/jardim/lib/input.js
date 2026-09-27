import { useEffect } from 'react'
import { state, toggleBouquet } from '../store.js'

export const bouquetActive = () => state.p > 0.885

// Ponteiro, giroscópio, chacoalhar e o gesto do buquê (clique = explode, arraste = gira).
export function useInput() {
  useEffect(() => {
    const pt = state.pointer
    let down = null

    const onMove = (e) => {
      pt.x = (e.clientX / window.innerWidth) * 2 - 1
      pt.y = -((e.clientY / window.innerHeight) * 2 - 1)
      if (down && bouquetActive()) {
        const dx = e.clientX - down.lx
        down.lx = e.clientX
        down.moved += Math.abs(dx)
        state.bouquet.spinVel += dx * 0.06
      }
    }
    const isUI = (el) => el.closest?.('a, button, .ui-block')
    const onDown = (e) => {
      if (isUI(e.target)) return
      down = { x: e.clientX, lx: e.clientX, t: performance.now(), moved: 0 }
    }
    const onUp = (e) => {
      if (!down) return
      const quick = performance.now() - down.t < 450 && down.moved < 10
      down = null
      if (quick && bouquetActive() && !isUI(e.target)) toggleBouquet()
    }

    // giroscópio: inclina a câmera; no iOS exige permissão após um toque
    const onOrient = (e) => {
      if (e.gamma == null) return
      state.gyro.enabled = true
      state.gyro.x = Math.max(-1, Math.min(1, e.gamma / 30))
      state.gyro.y = Math.max(-1, Math.min(1, (e.beta - 50) / 30))
    }
    let lastShake = 0
    const onMotion = (e) => {
      const a = e.accelerationIncludingGravity || e.acceleration
      if (!a) return
      const mag = Math.hypot(a.x || 0, a.y || 0, a.z || 0)
      const now = performance.now()
      if (mag > 28 && now - lastShake > 1500 && bouquetActive()) {
        lastShake = now
        toggleBouquet()
      }
    }
    const askPermission = async () => {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
          await DeviceOrientationEvent.requestPermission()
        }
        if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
          await DeviceMotionEvent.requestPermission()
        }
      } catch {
        /* usuário negou — toque segue funcionando */
      }
      window.removeEventListener('touchend', askPermission)
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown, { passive: true })
    window.addEventListener('pointerup', onUp, { passive: true })
    window.addEventListener('deviceorientation', onOrient, { passive: true })
    window.addEventListener('devicemotion', onMotion, { passive: true })
    window.addEventListener('touchend', askPermission, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('deviceorientation', onOrient)
      window.removeEventListener('devicemotion', onMotion)
      window.removeEventListener('touchend', askPermission)
    }
  }, [])
}
