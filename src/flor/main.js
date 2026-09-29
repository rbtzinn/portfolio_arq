// Protótipo: a flor-herói montada em 3D em tempo real, ligada ao scroll.
// Mesma coreografia (poseHero) e mesma câmera (cameraAt) que alimentavam o render do
// Blender — aqui calculadas ao vivo a cada quadro da tela, então o movimento é contínuo
// (60/120 Hz), sem quadros pré-renderizados, vídeo ou decodificação.
//
// Orçamento para celular:
// - um InstancedMesh por tipo de peça (~12 chamadas de desenho para a flor inteira);
// - plástico em MeshStandardMaterial (sem clearcoat/sheen) + reflexos de estúdio
//   pré-calculados uma vez (PMREM);
// - uma única luz com sombra, mapa pequeno no celular;
// - resolução limitada (1,5× no celular) e desenho só quando algo muda.
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildGeometries, baseStud, PLATE } from '../jardim/bricks/geometry.js'
import { buildHeroWorld, poseHero, cameraAt } from '../jardim/bricks/world.js'
import { PartBatch, ZERO } from '../jardim/bricks/PartBatch.js'
import './style.css'

const coarse = matchMedia('(pointer: coarse)').matches
const DPR = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2)
// trecho da coreografia: peças se organizando → caule → pétalas → flor completa
const P0 = 0.1
const P1 = 0.5

// ---------- renderer ----------
const canvas = document.getElementById('stage')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(DPR)
renderer.outputColorSpace = THREE.SRGBColorSpace
// Neutral preserva a saturação das peças (ACES desbotava o rosa)
renderer.toneMapping = THREE.NeutralToneMapping
renderer.toneMappingExposure = 0.95
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.shadowMap.autoUpdate = true

const scene = new THREE.Scene()
const CREAM = new THREE.Color('#efe5d4')
scene.background = CREAM
scene.fog = new THREE.Fog(CREAM, 70, 170)

// reflexos de estúdio: calculados uma vez (nada por quadro)
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.35
pmrem.dispose()

// ---------- luz (estufa: sol quente + céu) ----------
scene.add(new THREE.HemisphereLight('#fff6ea', '#cdb998', 0.55))
const sun = new THREE.DirectionalLight('#fff1dc', 2.4)
sun.position.set(18, 38, 22)
sun.target.position.set(0, 12, 0)
sun.castShadow = true
sun.shadow.mapSize.setScalar(coarse ? 1024 : 2048)
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 34, bottom: -8, near: 10, far: 90 })
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.03
sun.shadow.radius = 4
scene.add(sun, sun.target)

// ---------- piso de estúdio com grade suave (textura gerada em código) ----------
function gridTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const x = c.getContext('2d')
  x.fillStyle = '#efe5d4'
  x.fillRect(0, 0, 256, 256)
  x.strokeStyle = 'rgba(120, 96, 64, 0.16)'
  x.lineWidth = 3
  x.strokeRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(40, 40)
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.95 }))
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)

// ---------- plástico ABS leve ----------
// base colorida por instância + "subsurface" barato: a borda brilha na própria cor
function plastic() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0 })
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      {
        float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
        totalEmissiveRadiance += diffuseColor.rgb * 0.12 * (0.35 + 1.2 * fres);
      }`,
    )
  }
  m.customProgramCacheKey = () => 'abs-lite'
  return m
}
const material = plastic()

// ---------- flor + placa-base ----------
const geos = buildGeometries(coarse ? 16 : 22)
const world = buildHeroWorld(coarse ? 40 : 60)
const batch = new PartBatch(world.parts, geos, material)
scene.add(batch.group)

const PLATE_N = 8
const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE_N, PLATE, PLATE_N), new THREE.MeshStandardMaterial({ color: '#8fae80', roughness: 0.35 }))
plate.position.y = PLATE / 2
plate.castShadow = plate.receiveShadow = true
scene.add(plate)
const studs = new THREE.InstancedMesh(baseStud(), plate.material, PLATE_N * PLATE_N)
const sm = new THREE.Matrix4()
for (let i = 0; i < PLATE_N; i++)
  for (let j = 0; j < PLATE_N; j++) studs.setMatrixAt(i * PLATE_N + j, sm.makeTranslation(i - PLATE_N / 2 + 0.5, PLATE, j - PLATE_N / 2 + 0.5))
studs.castShadow = studs.receiveShadow = true
scene.add(studs)

// ---------- câmera ----------
const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400)
const cam = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 34 }
let W = 0
let H = 0
function resize() {
  const w = window.innerWidth
  const h = canvas.clientHeight || window.innerHeight
  // celular: a barra de endereço muda só a altura ao rolar — não recria o buffer por isso
  if (coarse && w === W && Math.abs(h - H) < 160) return
  W = w
  H = h
  renderer.setSize(W, H, false)
  camera.aspect = W / H
  dirty = true
}

// ---------- scroll → progresso da coreografia ----------
let target = 0
let P = P0
let dirty = true
const readScroll = () => {
  const max = document.documentElement.scrollHeight - window.innerHeight
  target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
}
window.addEventListener('scroll', readScroll, { passive: true })
window.addEventListener('resize', resize)

const intro = document.querySelector('.intro')
const done = document.querySelector('.done')
const fpsEl = document.querySelector('.fps')
const setOn = (el, on) => el.classList.contains('is-on') !== on && el.classList.toggle('is-on', on)

// ---------- quadro ----------
let last = performance.now()
let frames = 0
let draws = 0
let fpsAt = last
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  frames++
  // suaviza o scroll: movimento contínuo mesmo com eventos de scroll irregulares
  const goal = P0 + (P1 - P0) * target
  const next = P + (goal - P) * (1 - Math.exp(-10 * dt))
  const moving = Math.abs(next - P) > 1e-6 || Math.abs(goal - next) > 1e-6
  P = Math.abs(goal - next) < 1e-5 ? goal : next

  if (moving || dirty) {
    dirty = false
    draws++
    poseHero(world, P, (part, m) => batch.set(part, m || ZERO))
    batch.commit()
    cameraAt(P, camera.aspect, cam)
    camera.position.copy(cam.pos)
    camera.lookAt(cam.tgt)
    if (camera.fov !== cam.fov) {
      camera.fov = cam.fov
      camera.updateProjectionMatrix()
    } else if (camera.userData.aspect !== camera.aspect) camera.updateProjectionMatrix()
    camera.userData.aspect = camera.aspect
    renderer.render(scene, camera)
  }

  setOn(intro, target < 0.06)
  setOn(done, P > 0.478)

  if (now - fpsAt > 500) {
    const s = (now - fpsAt) / 1000
    fpsEl.textContent = `${Math.round(frames / s)} fps\n${Math.round(draws / s)} desenhos/s · ${renderer.info.render.calls} draw calls`
    frames = draws = 0
    fpsAt = now
  }
  requestAnimationFrame(tick)
}

resize()
readScroll()
requestAnimationFrame(tick)
