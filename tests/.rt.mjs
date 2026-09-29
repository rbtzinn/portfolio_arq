import { chromium } from 'playwright-core'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const vps = process.argv[2] === 'm' ? [{ n: 'm', width: 390, height: 844, mobile: true }] : [{ n: 'd', width: 1280, height: 800 }]
for (const vp of vps) {
  const c = await b.newContext({ viewport: vp, isMobile: !!vp.mobile, hasTouch: !!vp.mobile })
  const p = await c.newPage()
  p.setDefaultTimeout(180000)
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => m.type() === 'error' && !/ERR_CERT|fonts/.test(m.text()) && errs.push(m.text()))
  await p.goto('http://127.0.0.1:4175/')
  await p.waitForSelector('.ui.is-ready', { timeout: 120000 })
  for (const q of [0.02, 0.12, 0.22, 0.35, 0.49, 0.6, 0.64, 0.72, 0.8, 0.95]) {
    await p.evaluate((q) => window.__jump(q), q)
    await p.waitForTimeout(q > 0.9 ? 6000 : 2500)
    await p.screenshot({ path: '/tmp/claude-0/-home-user-portfolio-arq/d15370f6-4316-503f-acfd-93949aba1be8/scratchpad/rt/' + vp.n + '_' + q + '.png' })
  }
  console.log(vp.n, errs, await p.evaluate(() => [window.__state.totalPieces, window.__state.built]))
  await c.close()
}
await b.close()
