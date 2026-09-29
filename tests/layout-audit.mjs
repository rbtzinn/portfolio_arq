// Auditoria de layout do site (experiência Botânica Modular) com Playwright.
// Para cada viewport e ponto da narrativa verifica: overflow horizontal, textos cortados,
// sobreposição de blocos de interface, contraste do texto sobre o frame e erros de rede/console.
//
// Uso: node tests/layout-audit.mjs [baseURL=http://127.0.0.1:5199] [pasta de screenshots]
//   CHROME=/caminho/do/chrome para usar um Chromium específico.
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] || 'http://127.0.0.1:5199'
const OUT = process.argv[3] || 'tests/.shots'
const ONLY = process.env.ONLY?.split(',')
fs.mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: 'desk-1920', width: 1920, height: 1080 },
  { name: 'desk-1440', width: 1440, height: 900 },
  { name: 'desk-1280', width: 1280, height: 720 },
  { name: 'tab-1024', width: 1024, height: 768 },
  { name: 'tab-768p', width: 768, height: 1024, mobile: true },
  { name: 'phone-390', width: 390, height: 844, mobile: true },
  { name: 'phone-360', width: 360, height: 740, mobile: true },
  { name: 'phone-land', width: 844, height: 390, mobile: true },
].filter((v) => !ONLY || ONLY.includes(v.name))
const POINTS = (process.env.POINTS || '-1,-0.5,0,0.05,0.13,0.2,0.4,0.5,0.58,0.65,0.75,0.87,0.95').split(',').map(Number)

// roda na página: coleta problemas do estado atual
function inspect() {
  const W = innerWidth
  const H = innerHeight
  const issues = []
  const visible = (el) => {
    let e = el
    while (e && e !== document.body) {
      const cs = getComputedStyle(e)
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.5) return false
      e = e.parentElement
    }
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  if (document.documentElement.scrollWidth > W + 1) issues.push(`overflow horizontal: ${document.documentElement.scrollWidth}px > ${W}px`)

  // textos visíveis cortados pela borda
  const texts = [...document.querySelectorAll('.ui h1, .ui h2, .ui p, .ui li, .ui a, .ui button, .ui strong, .ui .mono')]
  for (const el of texts) {
    if (!visible(el) || !el.textContent.trim()) continue
    const r = el.getBoundingClientRect()
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1)
      issues.push(`cortado: "${el.textContent.trim().slice(0, 40)}" [${r.left | 0},${r.top | 0},${r.right | 0},${r.bottom | 0}]`)
  }

  // blocos de interface que não podem se sobrepor
  const blocks = []
  const add = (name, sel) =>
    document.querySelectorAll(sel).forEach((el) => {
      if (visible(el)) blocks.push({ name, r: el.getBoundingClientRect() })
    })
  add('marca', '.brand')
  add('meta', '.meta')
  add('trilho', '.rail')
  add('capítulo', '.ch.is-on > *')
  add('dica-buquê', '.bq-hint')
  add('som', '.sound')
  add('etiqueta', '.tag .tag__card')
  const hit = (a, b) => a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++) {
      const A = blocks[i]
      const B = blocks[j]
      if (A.name === B.name && A.name !== 'etiqueta') continue
      if (hit(A.r, B.r)) issues.push(`sobreposição: ${A.name} × ${B.name}`)
    }

  // contraste do texto do capítulo sobre o frame (lê o canvas; ignora scrims → conservador)
  const cv = document.querySelector('canvas.seq')
  // WebGL: lê pelo renderizador (o buffer não é preservado); 2D: getImageData
  // cena 3D: o motor desenha e lê os pixels antes da composição
  const eng = window.__state?.engine
  const ctx = eng ? { getImageData: (x, y, w, h) => ({ data: eng.sample(x, y, w, h) }) } : null
  const lum = (r, g, b) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  if (ctx) {
    const ratio = cv.width / cv.getBoundingClientRect().width
    for (const el of document.querySelectorAll('.ch.is-on h1, .ch.is-on h2, .ch.is-on .lede')) {
      if (!visible(el)) continue
      const r = el.getBoundingClientRect()
      const x = Math.max(0, r.left * ratio) | 0
      const y = Math.max(0, r.top * ratio) | 0
      const w = Math.max(1, Math.min(cv.width - x, r.width * ratio)) | 0
      const h = Math.max(1, Math.min(cv.height - y, r.height * ratio)) | 0
      const d = ctx.getImageData(x, y, w, h).data
      let L = 0
      let n = 0
      for (let i = 0; i < d.length; i += 4 * 37) {
        L += lum(d[i], d[i + 1], d[i + 2])
        n++
      }
      L /= n || 1
      // o scrim do capítulo empurra o fundo para creme (claro) ou escuro, como na página
      const light = window.__state?.light || 0
      const scrim = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scrim')) || 0
      const creamL = lum(242, 233, 218)
      const darkL = lum(12, 11, 10)
      L = L + (creamL - L) * light * scrim * 0.6 + (darkL - L) * (1 - light) * 0.5
      // qualquer sintaxe de cor (oklab, color-mix…) → pinta 1px e lê o sRGB
      const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
      probe.fillStyle = getComputedStyle(el).color
      probe.fillRect(0, 0, 1, 1)
      const c = probe.getImageData(0, 0, 1, 1).data
      const Lt = lum(c[0], c[1], c[2])
      const cr = (Math.max(L, Lt) + 0.05) / (Math.min(L, Lt) + 0.05)
      const min = el.matches('.lede') ? 3 : 2.6
      if (cr < min) issues.push(`contraste baixo ${cr.toFixed(1)}:1 em "${el.textContent.trim().slice(0, 30)}"`)
    }
  }
  return issues
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
let total = 0
const report = []
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: !!vp.mobile,
    hasTouch: !!vp.mobile,
    deviceScaleFactor: 1,
    ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  page.setDefaultTimeout(240000)
  const errors = []
  page.on('pageerror', (e) => errors.push('JS: ' + e.message))
  page.on('console', (m) => m.type() === 'error' && !/fonts|ERR_CERT|net::ERR_TOO_MANY/.test(m.text()) && errors.push('console: ' + m.text()))
  page.on('response', (r) => r.status() >= 400 && !r.url().includes('favicon') && errors.push(`HTTP ${r.status()} ${r.url()}`))
  await page.goto(`${BASE}/?gate=0`, { waitUntil: 'load' })
  await page.waitForSelector('.ui.is-ready', { timeout: 120000 })
  await page.waitForTimeout(1200)
  for (const p of POINTS) {
    await page.evaluate((p) => window.__jump(p), p)
    // desenho por software aqui (sem GPU): o jardim leva mais tempo por quadro
    await page.waitForTimeout(p >= 0.86 ? 9000 : p >= 0.45 ? 3500 : 1600)
    const issues = await page.evaluate(inspect)
    const file = path.join(OUT, `${vp.name}_${p}.png`)
    await page.screenshot({ path: file })
    if (issues.length) report.push({ vp: vp.name, p, issues })
    total += issues.length
  }
  if (errors.length) report.push({ vp: vp.name, p: '-', issues: [...new Set(errors)] })
  total += errors.length
  await ctx.close()
}
// ---------- robustez ----------
if (!process.env.SKIP_ROBUST) {
  // 1) girar o aparelho: retrato → paisagem redimensiona a cena sem quebrar
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push('JS: ' + e.message))
    await page.goto(`${BASE}/?gate=0`)
    await page.waitForSelector('.ui.is-ready', { timeout: 120000 })
    await page.evaluate(() => window.__jump(0.3))
    await page.waitForTimeout(2500)
    await page.setViewportSize({ width: 844, height: 390 })
    await page.waitForTimeout(3500)
    const r = await page.evaluate(() => {
      const c = document.querySelector('canvas.seq')
      const d = window.__state.engine.sample(c.width >> 1, c.height >> 1, 1, 1)
      return { drawn: d[0] + d[1] + d[2] > 0, w: window.__state.engine.W }
    })
    const issues = [...errs]
    if (r.w !== 844) issues.push(`cena não acompanhou a rotação (largura ${r.w})`)
    if (!r.drawn) issues.push('canvas vazio após girar')
    if (issues.length) report.push({ vp: 'girar', p: '-', issues })
    total += issues.length
    await ctx.close()
  }
  // 2) sem WebGL: o hero continua e aparece o aviso com "Tentar de novo"
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })
    await ctx.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, ...a) {
        return /webgl/.test(type) ? null : orig.call(this, type, ...a)
      }
    })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?gate=0`)
    const ok = await page
      .waitForSelector('text=Tentar de novo', { timeout: 20000 })
      .then(() => true)
      .catch(() => false)
    if (!ok) {
      report.push({ vp: 'sem WebGL', p: '-', issues: ['sem mensagem de erro quando o 3D não abre'] })
      total++
    }
    await ctx.close()
  }
  // 3) teclado: todos os controles alcançáveis têm foco visível
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true })
    const page = await ctx.newPage()
    await page.goto(`${BASE}/?gate=0`)
    await page.waitForSelector('.ui.is-ready', { timeout: 120000 })
    const issues = []
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      const f = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const cs = getComputedStyle(el)
        return { tag: el.tagName, txt: el.textContent.trim().slice(0, 24), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 }
      })
      if (f && !f.outline) issues.push(`sem foco visível: ${f.tag} "${f.txt}"`)
    }
    if (issues.length) report.push({ vp: 'teclado', p: '-', issues: [...new Set(issues)] })
    total += issues.length
    await ctx.close()
  }
}

await browser.close()

for (const r of report) {
  console.log(`\n[${r.vp} @ ${r.p}]`)
  for (const i of r.issues) console.log('  - ' + i)
}
console.log(`\n${total} problema(s) em ${VIEWPORTS.length} viewports × ${POINTS.length} pontos`)
process.exit(total ? 1 : 0)
