// Cena inteira em 3D em tempo real: peças soltas no escuro (lanterna), flor-herói, jardim
// com os projetos e buquê interativo. Tudo calculado ao vivo a partir do progresso do
// scroll com a mesma coreografia (world.js) que antes alimentava o render do Blender —
// o movimento é contínuo, sem quadros pré-renderizados nem vídeo.
//
// Orçamento (celular):
// - um InstancedMesh por tipo de peça em cada mundo (flor, jardim, buquê): poucas dezenas
//   de chamadas de desenho para milhares de peças;
// - geometria mais simples no jardim (visto de longe) do que na flor e no buquê;
// - plástico em MeshStandardMaterial + reflexos de estúdio pré-calculados uma vez (PMREM);
// - uma luz com sombra que acompanha o foco da câmera (mapa menor no celular);
// - resolução limitada e desenho só quando algo muda (ver needsRender).
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildGeometries, baseStud, PLATE } from '../bricks/geometry.js'
import { buildHeroWorld, poseHero, buildGardenWorld, poseGarden, cameraAt, SEQ_END } from '../bricks/world.js'
import { PartBatch, ZERO } from '../bricks/PartBatch.js'
import { BouquetRig } from './BouquetRig.js'
import { clamp, lerp, smooth, invLerp } from '../store.js'

const DARK = new THREE.Color('#0c0b0a')
const CREAM = new THREE.Color('#efe5d4')
const LABEL_Y = 8
const LABEL_X = 0.35
const LABEL_DZ = 8

// plástico ABS leve: cor por instância + "subsurface" barato (a borda brilha na própria cor)
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

// piso de estúdio com grade suave (textura gerada em código)
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
  t.repeat.set(100, 100)
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class Engine {
  static create(canvas, opts) {
    try {
      return new Engine(canvas, opts)
    } catch (e) {
      console.error(e)
      return null
    }
  }

  constructor(canvas, { coarse = false } = {}) {
    this.canvas = canvas
    this.coarse = coarse
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer = renderer
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // Neutral preserva a saturação das peças
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 0.95
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const scene = new THREE.Scene()
    this.scene = scene
    scene.background = DARK.clone()
    scene.fog = new THREE.Fog(DARK.clone(), 70, 190)
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()

    // ---- luz: estufa (sol + céu) que acende depois do escuro, e a lanterna ----
    this.hemi = new THREE.HemisphereLight('#fff6ea', '#cdb998', 0)
    this.sun = new THREE.DirectionalLight('#fff1dc', 0)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.setScalar(coarse ? 1024 : 2048)
    Object.assign(this.sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 5, far: 120 })
    this.sun.shadow.bias = -0.0004
    this.sun.shadow.normalBias = 0.03
    this.sun.shadow.radius = 4
    // lanterna: luz quente que segue o ponteiro/giroscópio no trecho escuro
    this.torch = new THREE.PointLight('#ffc98a', 0, 60, 1.6)
    scene.add(this.hemi, this.sun, this.sun.target, this.torch)

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.95 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.z = -80
    floor.receiveShadow = true
    scene.add(floor)

    // ---- mundos ----
    const material = plastic()
    const geosHi = buildGeometries(coarse ? 16 : 22)
    const geosLo = buildGeometries(coarse ? 10 : 14)

    this.hero = buildHeroWorld(coarse ? 40 : 60)
    this.heroBatch = new PartBatch(this.hero.parts, geosHi, material)
    scene.add(this.heroBatch.group)

    this.garden = buildGardenWorld({ budget: 1, density: coarse ? 0.75 : 1 })
    const gParts = this.garden.flowers.flatMap((f) => f.parts).concat(this.garden.props)
    this.gardenBatch = new PartBatch(gParts, geosLo, material)
    scene.add(this.gardenBatch.group)
    this.buildSlabs()

    this.bouquet = new BouquetRig(geosHi, material)
    scene.add(this.bouquet.group)
    this.total = this.hero.count + this.garden.count + this.bouquet.count

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 500)
    this.cam = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 34 }
    this._v = new THREE.Vector3()
    this._right = new THREE.Vector3()
    this._up = new THREE.Vector3()
    this.lastP = -1
    this.built = 0
    this.W = 0
    this.H = 0
  }

  // placas-base dos canteiros: caixa + pinos (instanciados), crescem junto com o canteiro
  buildSlabs() {
    const slabs = this.garden.slabs
    const box = new THREE.BoxGeometry(1, PLATE, 1)
    box.translate(0, PLATE / 2, 0)
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 })
    this.slabMesh = new THREE.InstancedMesh(box, mat, slabs.length)
    let nStuds = 0
    for (const s of slabs) nStuds += Math.round(s.w) * Math.round(s.d)
    this.studMesh = new THREE.InstancedMesh(baseStud(), mat, nStuds)
    const col = new THREE.Color()
    let k = 0
    slabs.forEach((s, i) => {
      s.index = i
      s.studs = []
      this.slabMesh.setColorAt(i, col.set(s.color))
      for (let a = 0; a < Math.round(s.w); a++)
        for (let b = 0; b < Math.round(s.d); b++) {
          this.studMesh.setColorAt(k, col)
          s.studs.push([k++, a - s.w / 2 + 0.5, b - s.d / 2 + 0.5])
        }
    })
    for (const m of [this.slabMesh, this.studMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      m.frustumCulled = false
      m.castShadow = m.receiveShadow = true
      m.instanceColor.needsUpdate = true
      this.scene.add(m)
    }
    this.slabSig = ''
  }

  resize(w, h) {
    if (w === this.W && h === this.H) return
    this.W = w
    this.H = h
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.lastP = -1
  }

  // P = tempo da animação (0..1); view = { zoom, px, py, torch: {x, y, amount} (-1..1) }
  update(P, view, now) {
    const moved = P !== this.lastP
    if (moved) {
      this.lastP = P
      this.poseWorlds(P)
    }
    this.bouquet.update(P, now)
    this.placeCamera(P, view)
    this.light(P, view)
  }

  poseWorlds(P) {
    let built = poseHero(this.hero, Math.min(P, SEQ_END), (part, m) => this.heroBatch.set(part, m || ZERO))
    this.heroBatch.commit()
    // jardim: só existe a partir do canteiro da flor; depois do fim fica parado
    const gP = Math.min(P, SEQ_END + 0.02)
    this.gardenBatch.group.visible = gP > 0.44
    if (this.gardenBatch.group.visible) {
      const slabs = []
      built += poseGarden(this.garden, gP, (part, m) => {
        if (part.studs) slabs.push([part, m && m.clone()])
        else this.gardenBatch.set(part, m || ZERO)
      })
      this.gardenBatch.commit()
      this.poseSlabs(slabs)
    }
    this.slabMesh.visible = this.studMesh.visible = this.gardenBatch.group.visible
    this.built = built
  }

  poseSlabs(list) {
    // só reenvia quando alguma placa mudou (crescendo)
    const sig = list.map(([, m]) => (m ? m.elements[0].toFixed(3) + m.elements[5].toFixed(3) : '0')).join()
    if (sig === this.slabSig) return
    this.slabSig = sig
    const o = new THREE.Matrix4()
    const t = new THREE.Matrix4()
    for (const [s, m] of list) {
      if (!m) {
        this.slabMesh.setMatrixAt(s.index, ZERO)
        for (const [k] of s.studs) this.studMesh.setMatrixAt(k, ZERO)
        continue
      }
      this.slabMesh.setMatrixAt(s.index, o.copy(m).multiply(t.makeScale(s.w, 1, s.d)))
      for (const [k, dx, dz] of s.studs) this.studMesh.setMatrixAt(k, o.copy(m).multiply(t.makeTranslation(dx, PLATE, dz)))
    }
    this.slabMesh.instanceMatrix.needsUpdate = true
    this.studMesh.instanceMatrix.needsUpdate = true
  }

  placeCamera(P, { zoom = 1, px = 0, py = 0 } = {}) {
    const c = cameraAt(P, this.camera.aspect, this.cam)
    const cam = this.camera
    cam.position.copy(c.pos)
    cam.lookAt(c.tgt)
    // paralaxe sutil pelo ponteiro (em unidades de mundo, no plano da câmera)
    if (px || py) {
      this._right.setFromMatrixColumn(cam.matrix, 0)
      this._up.setFromMatrixColumn(cam.matrix, 1)
      cam.position.addScaledVector(this._right, px).addScaledVector(this._up, py)
      cam.lookAt(c.tgt)
    }
    const fov = c.fov / zoom
    if (cam.fov !== fov || cam.userData.aspect !== cam.aspect) {
      cam.fov = fov
      cam.userData.aspect = cam.aspect
      cam.updateProjectionMatrix()
    }
    // o sol (e sua sombra) acompanha o foco da câmera
    this.sun.target.position.copy(c.tgt)
    this.sun.position.copy(c.tgt).add(this._v.set(18, 38, 22))
  }

  light(P, { torch } = {}) {
    const L = smooth(invLerp(0.085, 0.2, P))
    this.scene.background.copy(DARK).lerp(CREAM, L)
    this.scene.fog.color.copy(this.scene.background)
    this.hemi.intensity = 0.012 + 0.538 * L
    this.sun.intensity = 2.4 * L
    this.scene.environmentIntensity = 0.02 + 0.33 * L
    // lanterna: um ponto de luz à frente da câmera, na direção do ponteiro
    const amt = (torch?.amount ?? 0) * (1 - L)
    this.torch.intensity = 160 * amt
    this.torch.visible = amt > 0.001
    if (this.torch.visible) {
      this._v.set(torch.x, torch.y, 0.5).unproject(this.camera).sub(this.camera.position).normalize()
      this.torch.position.copy(this.camera.position).addScaledVector(this._v, 16)
    }
  }

  // etiquetas dos projetos: posição na tela (px de CSS) + visibilidade base
  labels(P, out = []) {
    const L = this.garden.labels
    for (let i = 0; i < L.length; i++) {
      const lab = L[i]
      // âncora na altura das flores, na borda do canteiro voltada para o caminho e para a
      // câmera que se aproxima: os canteiros ficam nas laterais e a câmera passa rente a eles
      this._v.set(lab.pos.x * LABEL_X, LABEL_Y, lab.pos.z + LABEL_DZ)
      const d = this.camera.position.distanceTo(this._v)
      this._v.project(this.camera)
      const front = this._v.z < 1 && Math.abs(this._v.x) < 1.3
      // só depois que o canteiro está montado (flores: início + 0,02 + 0,045; a cascata final
      // de cada flor é curta — 0,05 já mostra o canteiro pronto enquanto a câmera passa)
      const done = lab.t0 + 0.05
      const vis = front ? smooth(invLerp(done, done + 0.012, P)) * (1 - smooth(invLerp(55, 75, d))) : 0
      out[lab.index] = [((this._v.x + 1) / 2) * this.W, ((1 - this._v.y) / 2) * this.H, vis]
    }
    return out
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  // pixels da tela (testes): desenha e lê antes da composição
  sample(x, y, w, h) {
    this.render()
    const gl = this.renderer.getContext()
    const out = new Uint8Array(w * h * 4)
    gl.readPixels(Math.round(x), Math.round(this.canvas.height - y - h), w, h, gl.RGBA, gl.UNSIGNED_BYTE, out)
    return out
  }
}
