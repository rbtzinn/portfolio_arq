// Renderizador WebGL da sequência: cada frame decodificado vira uma textura (enviada à GPU
// uma vez). Crossfade, lanterna e turntable são contas de shader — quase de graça em
// qualquer celular, ao contrário de redesenhar imagens em tela cheia num canvas 2D.

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

// frame principal + crossfade + lanterna (versão iluminada revelada por máscara radial)
const FRAG_MAIN = `
precision mediump float;
uniform sampler2D uA, uB, uLA, uLB;
uniform float uT, uLT, uTorch;
uniform vec4 uRect;   // x, y, w, h (px do canvas, origem no topo)
uniform vec2 uRes;
uniform vec3 uPos;    // x, y, raio da lanterna (px)
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = (p - uRect.xy) / uRect.zw;
  vec3 c = mix(texture2D(uA, uv).rgb, texture2D(uB, uv).rgb, uT);
  if (uTorch > 0.001) {
    vec3 l = mix(texture2D(uLA, uv).rgb, texture2D(uLB, uv).rgb, uLT);
    float d = distance(p, uPos.xy) / uPos.z;
    float m = d < 0.35 ? mix(1.0, 0.9, d / 0.35)
            : d < 0.7 ? mix(0.9, 0.3, (d - 0.35) / 0.35)
            : d < 1.0 ? mix(0.3, 0.05, (d - 0.7) / 0.3) : 0.05;
    c = mix(c, l, m * uTorch);
  }
  gl_FragColor = vec4(c, 1.0);
}
`

// só a lanterna, sobre o vídeo: versão iluminada revelada pela máscara (alfa pré-multiplicado)
const FRAG_TORCH = `
precision mediump float;
uniform sampler2D uLA, uLB;
uniform float uLT, uTorch;
uniform vec4 uRect;
uniform vec2 uRes;
uniform vec3 uPos;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = (p - uRect.xy) / uRect.zw;
  vec3 l = mix(texture2D(uLA, uv).rgb, texture2D(uLB, uv).rgb, uLT);
  float d = distance(p, uPos.xy) / uPos.z;
  float m = d < 0.35 ? mix(1.0, 0.9, d / 0.35)
          : d < 0.7 ? mix(0.9, 0.3, (d - 0.35) / 0.35)
          : d < 1.0 ? mix(0.3, 0.05, (d - 0.7) / 0.3) : 0.05;
  float a = m * uTorch;
  gl_FragColor = vec4(l * a, a);
}
`

// turntable do buquê: alfa pré-multiplicado sobre o plate
const FRAG_TURN = `
precision mediump float;
uniform sampler2D uA, uB;
uniform float uT, uAlpha;
uniform vec4 uRect;
uniform vec2 uRes;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = (p - uRect.xy) / uRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
  gl_FragColor = mix(texture2D(uA, uv), texture2D(uB, uv), uT) * uAlpha;
}
`

function program(gl, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }
  const p = gl.createProgram()
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT))
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs))
  gl.bindAttribLocation(p, 0, 'aPos')
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
  const u = {}
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(p, i).name
    u[name] = gl.getUniformLocation(p, name)
  }
  return { p, u }
}

export class GLRenderer {
  // transparent: camada por cima do <video> (fundo transparente em vez de opaco)
  static create(canvas, transparent = false) {
    try {
      const gl = canvas.getContext('webgl', { alpha: transparent, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' })
      if (!gl) return null
      return new GLRenderer(canvas, gl)
    } catch {
      return null
    }
  }

  constructor(canvas, gl) {
    this.canvas = canvas
    this.gl = gl
    this.lost = false
    this.init()
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
    })
    canvas.addEventListener('webglcontextrestored', () => {
      this.init()
      this.lost = false
      this.onRestore?.()
    })
  }

  init() {
    const gl = this.gl
    this.main = program(gl, FRAG_MAIN)
    this.turn = program(gl, FRAG_TURN)
    this.torch = program(gl, FRAG_TORCH)
    // um triângulo que cobre a tela inteira
    this.buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
  }

  // bitmap (já pré-multiplicado, orientação original) → textura
  upload(bmp) {
    const gl = this.gl
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp)
    return { tex, w: bmp.width, h: bmp.height }
  }

  release(entry) {
    if (entry?.tex && !this.lost) this.gl.deleteTexture(entry.tex)
  }

  bind(unit, entry, uniform) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, entry.tex)
    gl.uniform1i(uniform, unit)
  }

  // rect em px do canvas; torch = { x, y, r, amount } em px do canvas
  // leitura de pixels (testes): redesenha o último quadro e lê antes da composição
  read(x, y, w, h) {
    if (!this.last || this.lost) return null
    this.drawMain(this.last.main)
    if (this.last.turn) this.drawTurn(this.last.turn)
    const gl = this.gl
    const out = new Uint8Array(w * h * 4)
    gl.readPixels(x, this.canvas.height - y - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out)
    return out
  }

  drawMain(args) {
    const { A, B, t, LA, LB, lt, torch, rect } = args
    this.last = { main: args, turn: null }
    if (this.lost) return
    const gl = this.gl
    const { p, u } = this.main
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.disable(gl.BLEND)
    gl.useProgram(p)
    this.bind(0, A, u.uA)
    this.bind(1, B || A, u.uB)
    const lit = torch && torch.amount > 0.001 && LA
    this.bind(2, lit ? LA : A, u.uLA)
    this.bind(3, lit ? LB || LA : A, u.uLB)
    gl.uniform1f(u.uT, B ? t : 0)
    gl.uniform1f(u.uLT, lit && LB ? lt : 0)
    gl.uniform1f(u.uTorch, lit ? torch.amount : 0)
    gl.uniform4f(u.uRect, rect[0], rect[1], rect[2], rect[3])
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height)
    gl.uniform3f(u.uPos, torch?.x || 0, torch?.y || 0, torch?.r || 1)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  clear() {
    this.last = null
    if (this.lost) return
    const gl = this.gl
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  drawTorch({ LA, LB, lt, torch, rect }) {
    if (this.lost) return
    const gl = this.gl
    const { p, u } = this.torch
    gl.disable(gl.BLEND)
    gl.useProgram(p)
    this.bind(0, LA, u.uLA)
    this.bind(1, LB || LA, u.uLB)
    gl.uniform1f(u.uLT, LB ? lt : 0)
    gl.uniform1f(u.uTorch, torch.amount)
    gl.uniform4f(u.uRect, rect[0], rect[1], rect[2], rect[3])
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height)
    gl.uniform3f(u.uPos, torch.x, torch.y, torch.r)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  drawTurn(args) {
    const { A, B, t, alpha, rect } = args
    if (this.last) this.last.turn = args
    if (this.lost) return
    const gl = this.gl
    const { p, u } = this.turn
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(p)
    this.bind(0, A, u.uA)
    this.bind(1, B || A, u.uB)
    gl.uniform1f(u.uT, B ? t : 0)
    gl.uniform1f(u.uAlpha, alpha)
    gl.uniform4f(u.uRect, rect[0], rect[1], rect[2], rect[3])
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.disable(gl.BLEND)
  }
}
