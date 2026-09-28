import * as THREE from 'three'

// Plástico ABS: base colorida por instância, clearcoat brilhante, sheen suave,
// e um termo barato de "subsurface" — a borda da peça brilha levemente na própria cor,
// imitando a luz que atravessa o plástico.
export function createABS({ sss = 0.14 } = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.26,
    metalness: 0,
    clearcoat: 0.75,
    clearcoatRoughness: 0.14,
    ior: 1.46,
    specularIntensity: 0.9,
    sheen: 0.25,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color('#fff4e6'),
  })
  m.userData.uSSS = { value: sss }
  m.userData.sssBase = sss
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSSS = m.userData.uSSS
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSSS;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.0);
          totalEmissiveRadiance += diffuseColor.rgb * uSSS * (0.35 + 1.2 * fres);
        }`,
      )
  }
  m.customProgramCacheKey = () => 'abs-sss'
  return m
}

// Paleta: creme quente, sálvias, e as cores saturadas das peças.
export const C = {
  cream: '#F2E9DA',
  creamDeep: '#E8DCC6',
  ink: '#1D1A16',
  sage: '#9DB48F',
  sageLight: '#B9CBAA',
  sageDark: '#5F7E57',
  olive: '#4B6B3F',
  leaf: '#6E9B4F',
  lime: '#A7C957',
  pink: '#F58BB0',
  pinkHot: '#E6437A',
  blush: '#FBC5D2',
  orange: '#FF7A1A',
  coral: '#FF5E4D',
  yellow: '#FFC21A',
  butter: '#FFE08A',
  white: '#FBF7EE',
  lilac: '#B79AE0',
  tan: '#D9B98A',
  terracotta: '#C8643B',
}
