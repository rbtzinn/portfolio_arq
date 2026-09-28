// Perfil de desempenho em celular emulado: DPR 3, toque, CPU desacelerada.
// Rola a página inteira e mede tarefas longas, tempo de script/estilo/layout e quadros.
// Uso: node tests/perf-mobile.mjs [url=http://127.0.0.1:4173/] [cpu=4]
import { chromium } from 'playwright-core'
const URL = process.argv[2] || 'http://127.0.0.1:4173/'
const CPU = +(process.argv[3] || 4)
const b = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
page.setDefaultTimeout(180000)
const cdp = await ctx.newCDPSession(page)
await cdp.send('Performance.enable')
await page.goto(URL + (URL.includes('?') ? '&' : '?') + 'gate=0')
await page.waitForSelector('.ui.is-ready')
await page.waitForTimeout(4000) // deixa os frames chegarem
if (process.env.EXP) await page.evaluate(process.env.EXP)
await page.waitForTimeout(500)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
// RANGE=a,b: mede só esse trecho da experiência (0..1, depois do hero), p. ex. uma pausa com texto
const RANGE = process.env.RANGE?.split(',').map(Number)
const res = await page.evaluate(async (RANGE) => {
  const longs = []
  new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push(e.duration))).observe({ type: 'longtask', buffered: false })
  const max = document.documentElement.scrollHeight - innerHeight
  const heroH = document.querySelector('.hero-space')?.offsetHeight || 0
  const yAt = (k) => (RANGE ? heroH + (RANGE[0] + (RANGE[1] - RANGE[0]) * k) * (max - heroH) : k * max * 0.9)
  if (RANGE) {
    scrollTo(0, yAt(0))
    await new Promise((r) => setTimeout(r, 1500))
  }
  const gaps = []
  let last = performance.now()
  const t0 = last
  const DUR = 16000 // rola tudo em 16 s, como um dedo firme
  await new Promise((done) => {
    const step = (now) => {
      gaps.push(now - last)
      last = now
      const k = Math.min(1, (now - t0) / DUR)
      scrollTo(0, yAt(k))
      if (k < 1) requestAnimationFrame(step)
      else done()
    }
    requestAnimationFrame(step)
  })
  gaps.sort((a, b) => a - b)
  const q = (p) => gaps[Math.floor(gaps.length * p)]
  return { frames: gaps.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), over50: gaps.filter((g) => g > 50).length, longTasks: longs.length, longMs: Math.round(longs.reduce((a, b) => a + b, 0)) }
}, RANGE)
const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
const d = (k) => Math.round((m1[k] - m0[k]) * 1000)
console.log(JSON.stringify({ cpu: CPU, ...res, scriptMs: d('ScriptDuration'), styleMs: d('RecalcStyleDuration'), layoutMs: d('LayoutDuration'), taskMs: d('TaskDuration'), styleCount: m1.RecalcStyleCount - m0.RecalcStyleCount, layoutCount: m1.LayoutCount - m0.LayoutCount }))
await b.close()
