import * as THREE from 'three'

// Agrupa peças por tipo: um InstancedMesh por geometria, cor por instância.
// Mantém referência (mesh, index) em cada peça para atualização direta de matrizes.
export class PartBatch {
  constructor(parts, geos, material, { castShadow = true, receiveShadow = true } = {}) {
    this.group = new THREE.Group()
    this.parts = parts
    this.meshes = []
    const byType = new Map()
    for (const p of parts) {
      if (!byType.has(p.type)) byType.set(p.type, [])
      byType.get(p.type).push(p)
    }
    const color = new THREE.Color()
    for (const [type, list] of byType) {
      const geo = geos[type]
      if (!geo) throw new Error('geometria ausente: ' + type)
      const mesh = new THREE.InstancedMesh(geo, material, list.length)
      mesh.name = type
      mesh.castShadow = castShadow
      mesh.receiveShadow = receiveShadow
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      list.forEach((p, i) => {
        p.mesh = mesh
        p.index = i
        mesh.setColorAt(i, color.set(p.color))
        mesh.setMatrixAt(i, p.matrix)
      })
      mesh.instanceColor.needsUpdate = true
      this.meshes.push(mesh)
      this.group.add(mesh)
    }
    // pré-decomposição do alvo
    for (const p of parts) {
      p.tp = new THREE.Vector3()
      p.tq = new THREE.Quaternion()
      p.ts = new THREE.Vector3()
      p.matrix.decompose(p.tp, p.tq, p.ts)
    }
  }
  // Modo compactado: só o que é visível ocupa slots (mesh.count = visíveis).
  begin() {
    for (const m of this.meshes) m.userData.cursor = 0
  }
  push(part, m) {
    const mesh = part.mesh
    const i = mesh.userData.cursor++
    mesh.setMatrixAt(i, m)
    if (part.slot !== i || mesh.userData.slotOwner?.[i] !== part) {
      ;(mesh.userData.slotOwner ||= [])[i] = part
      part.slot = i
      mesh.setColorAt(i, part.c || (part.c = new THREE.Color(part.color)))
      mesh.userData.colorDirty = true
    }
  }
  end() {
    for (const m of this.meshes) {
      m.count = m.userData.cursor
      m.instanceMatrix.needsUpdate = true
      if (m.userData.colorDirty) {
        m.instanceColor.needsUpdate = true
        m.userData.colorDirty = false
      }
    }
  }
  set(part, m) {
    part.mesh.setMatrixAt(part.index, m)
  }
  commit() {
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true
  }
  dispose() {
    for (const m of this.meshes) m.dispose()
  }
}

export const ZERO = new THREE.Matrix4().makeScale(0, 0, 0)
