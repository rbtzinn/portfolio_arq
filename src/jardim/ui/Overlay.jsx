import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { state, smooth, invLerp, clamp } from '../store.js'
import { enableSound } from '../lib/audio.js'
import { scrollToProgress } from '../lib/scroll.js'
import { toggleBouquet } from '../scene/Bouquet.jsx'
import { slugify } from '../../utils/slug.js'
import { buildHero } from '../bricks/flowers.js'

const NUM = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']
const TENS = { 20: 'vinte', 30: 'trinta', 40: 'quarenta' }
const extenso = (n) => (n <= 10 ? NUM[n] : n % 10 === 0 ? TENS[n] : `${TENS[n - (n % 10)]} e ${NUM[n % 10]}`)
const cap = (s) => s[0].toUpperCase() + s.slice(1)

// Lista de peças real, contada a partir da própria flor-herói.
function heroBOM() {
  const parts = buildHero()
  const count = (fn) => parts.filter(fn).length
  const stemLike = (p) => p.role === 'stem' || p.role === 'leaf'
  return {
    bars: count((p) => stemLike(p) && p.type.startsWith('bar')),
    plates: count((p) => stemLike(p) && (p.type === 'roundPlate' || p.type === 'roundBrick')),
    slopes: count((p) => p.type === 'slope'),
    leaves: count((p) => p.type === 'leaf'),
    petals: count((p) => p.type.startsWith('petal')),
    total: parts.length,
  }
}

// Capítulos: [entra, sai]. A opacidade e o deslocamento vêm do progresso suavizado.
const CHAPTERS = [
  { id: 'void', a: -1, b: 0.085, step: '01' },
  { id: 'stem', a: 0.115, b: 0.285, step: '02' },
  { id: 'bloom', a: 0.315, b: 0.47, step: '03' },
  { id: 'reveal', a: 0.5, b: 0.6, step: '04' },
  { id: 'garden', a: 0.62, b: 0.83, step: '04' },
  { id: 'bouquet', a: 0.885, b: 2, step: '05' },
]
const NAV = [
  { label: 'Solto', p: 0 },
  { label: 'Caule', p: 0.2 },
  { label: 'Flor', p: 0.43 },
  { label: 'Jardim', p: 0.56 },
  { label: 'Buquê', p: 0.95 },
]

const pad = (n, l = 3) => String(Math.max(0, Math.round(n))).padStart(l, '0')

export default function Overlay({ projects }) {
  const bom = useMemo(heroBOM, [])
  const refs = useRef({})
  const counter = useRef()
  const total = useRef()
  const stepEl = useRef()
  const bar = useRef()
  const hint = useRef()
  const bqHint = useRef()
  const bqBtn = useRef()
  const loader = useRef()
  const loaderCount = useRef()
  const navRefs = useRef([])
  const [sound, setSound] = useState(false)
  const [ready, setReady] = useState(false)
  state.labelEls = state.labelEls || []

  // carregamento: conta as peças enquanto a cena compila
  useEffect(() => {
    const o = { n: 0 }
    const tw = gsap.to(o, {
      n: 480,
      duration: 2.2,
      ease: 'power2.out',
      onUpdate: () => loaderCount.current && (loaderCount.current.textContent = pad(o.n, 4)),
    })
    const done = () => {
      tw.progress(1)
      const target = state.heroCount + (state.gardenCount || 0) + (state.bouquetCount || 0)
      if (loaderCount.current) loaderCount.current.textContent = pad(target, 4)
      setTimeout(() => setReady(true), 250)
    }
    if (state.ready) done()
    window.addEventListener('jardim:ready', done)
    return () => window.removeEventListener('jardim:ready', done)
  }, [])

  useEffect(() => {
    const tick = () => {
      const P = state.p
      let scrim = 0
      for (const c of CHAPTERS) {
        const el = refs.current[c.id]
        if (!el) continue
        const fin = c.a < 0 ? 1 : smooth(invLerp(c.a, c.a + 0.03, P))
        const fout = smooth(invLerp(c.b - 0.03, c.b, P))
        const o = fin * (1 - fout)
        el.style.opacity = o.toFixed(3)
        el.style.transform = `translate3d(0, ${((1 - fin) * 40 - fout * 40).toFixed(1)}px, 0)`
        el.style.visibility = o < 0.01 ? 'hidden' : 'visible'
        el.classList.toggle('is-on', o > 0.6)
        if (c.id !== 'garden') scrim = Math.max(scrim, o)
      }
      document.documentElement.style.setProperty('--scrim', scrim.toFixed(3))
      const cur = [...CHAPTERS].reverse().find((c) => P >= c.a - 0.02) || CHAPTERS[0]
      if (stepEl.current && stepEl.current.textContent !== cur.step) stepEl.current.textContent = cur.step
      const tot = state.heroCount + (state.gardenCount || 0) + (state.bouquetCount || 0)
      const n = (state.heroSnapped || 0) + (state.gardenGrown || 0) + (state.bouquetAssembled || 0)
      if (counter.current) counter.current.textContent = pad(n, 4)
      if (total.current) total.current.textContent = pad(tot, 4)
      if (bar.current) bar.current.style.transform = `scaleY(${clamp(state.progress).toFixed(4)})`
      if (hint.current) hint.current.style.opacity = (1 - smooth(invLerp(0.01, 0.05, P))).toFixed(3)
      document.documentElement.style.setProperty('--light', smooth(invLerp(0.085, 0.2, P)).toFixed(3))
      navRefs.current.forEach((el, i) => {
        if (!el) return
        const next = NAV[i + 1]?.p ?? 2
        el.classList.toggle('is-active', P >= NAV[i].p - 0.04 && P < next - 0.04)
      })
      if (bqBtn.current) {
        const o = smooth(invLerp(0.9, 0.93, P))
        bqBtn.current.style.opacity = o.toFixed(3)
        bqBtn.current.style.pointerEvents = o > 0.5 ? 'auto' : 'none'
      }
      if (bqHint.current) {
        const m = state.bouquet.mode
        const touch = window.matchMedia('(pointer: coarse)').matches
        const txt =
          m === 'idle'
            ? touch
              ? 'Toque ou chacoalhe para desmontar'
              : 'Clique no buquê para desmontar'
            : m === 'exploded'
              ? touch
                ? 'Toque para remontar'
                : 'Clique para remontar'
              : 'Remontando…'
        if (bqHint.current.textContent !== txt) bqHint.current.textContent = txt
      }
    }
    gsap.ticker.add(tick)
    return () => gsap.ticker.remove(tick)
  }, [])

  const toggleSound = () => {
    enableSound(!sound)
    setSound(!sound)
  }

  return (
    <div className={`ui ${ready ? 'is-ready' : ''}`}>
      <div ref={loader} className="loader" aria-hidden={ready}>
        <div className="loader__box">
          <span className="mono">Separando peças</span>
          <span ref={loaderCount} className="loader__n">0000</span>
        </div>
      </div>

      <header className="top">
        <a className="brand ui-block" href="/" aria-label="Helena Costa Arquitetura — site principal">
          <span className="brand__mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span className="brand__name">
            Helena Costa<em>Arquitetura</em>
          </span>
        </a>
        <div className="meta mono">
          <span>
            Passo <b ref={stepEl}>01</b>/05
          </span>
          <span className="meta__count">
            <b ref={counter}>0000</b>/<span ref={total}>0000</span> peças
          </span>
        </div>
      </header>

      <nav className="rail ui-block" aria-label="Capítulos">
        <div className="rail__line">
          <div ref={bar} className="rail__fill" />
        </div>
        {NAV.map((n, i) => (
          <button key={n.label} ref={(el) => (navRefs.current[i] = el)} className="rail__dot" onClick={() => scrollToProgress(n.p)}>
            <span className="mono">{String(i + 1).padStart(2, '0')}</span>
            <em>{n.label}</em>
          </button>
        ))}
      </nav>

      <section ref={(el) => (refs.current.void = el)} className="ch ch--void">
        <p className="kicker mono">Botânica Modular — portfólio em peças</p>
        <h1>
          Tudo começa
          <br />
          <em>solto.</em>
        </h1>
        <p className="lede">Centenas de peças no escuro e nenhuma instrução. Mova o cursor: a luz é você.</p>
      </section>

      <section ref={(el) => (refs.current.stem = el)} className="ch ch--stem">
        <p className="kicker mono">Passo 02 — Estrutura</p>
        <h2>
          Antes da flor,
          <br />
          <em>a estrutura.</em>
        </h2>
        <p className="lede">Todo projeto nasce do que não se vê: eixo, apoio, encaixe. Um caule é arquitetura em miniatura.</p>
        <ul className="bom mono" aria-label="Lista de peças">
          <li>
            <b>{bom.bars}×</b> barra
          </li>
          <li>
            <b>{bom.plates}×</b> peça redonda 1×1
          </li>
          <li>
            <b>{bom.slopes}×</b> slope 45° 1×2
          </li>
          <li>
            <b>{bom.leaves}×</b> folha curva 3×5
          </li>
        </ul>
      </section>

      <section ref={(el) => (refs.current.bloom = el)} className="ch ch--bloom">
        <p className="kicker mono">Passo 03 — Desabrochar</p>
        <h2>
          Peça por peça,
          <br />
          <em>a forma aparece.</em>
        </h2>
        <p className="lede">
          {cap(extenso(bom.petals))} placas curvas, cada uma no seu ângulo. O detalhe é o que transforma estrutura em lugar.
        </p>
      </section>

      <section ref={(el) => (refs.current.reveal = el)} className="ch ch--reveal">
        <p className="kicker mono">Passo 04 — Jardim</p>
        <h2>
          Arquitetura
          <br />
          <em>é cultivar.</em>
        </h2>
        <p className="lede">Cada canteiro deste jardim é um projeto. Caminhe entre eles.</p>
      </section>

      <section ref={(el) => (refs.current.garden = el)} className="ch ch--garden">
        <p className="kicker mono">Passo 04 — Projetos selecionados</p>
      </section>

      {projects.map((p, i) => (
        <a
          key={p.id}
          ref={(el) => (state.labelEls[i] = el)}
          className="tag ui-block"
          href={`/projetos/${slugify(p.title)}`}
          style={{ opacity: 0 }}
        >
          <span className="tag__dot" />
          <span className="tag__line" />
          <span className="tag__card">
            <span className="mono">Canteiro {String(i + 1).padStart(2, '0')} · {p.category}</span>
            <strong>{p.title}</strong>
            <span className="tag__cta mono">Ver projeto →</span>
          </span>
        </a>
      ))}

      <section ref={(el) => (refs.current.bouquet = el)} className="ch ch--bouquet">
        <p className="kicker mono">Passo 05 — Buquê</p>
        <h2>
          Monte. Desmonte.
          <br />
          <em>Recomece.</em>
        </h2>
        <p className="lede">Um bom projeto é feito de partes que podem ser repensadas. Vamos montar o seu?</p>
        <div className="actions ui-block">
          <a className="btn btn--solid" href="/#contato">
            Iniciar um projeto
          </a>
          <a className="btn" href="/">
            Site completo
          </a>
        </div>
      </section>

      <button ref={bqBtn} className="bq-hint mono ui-block" onClick={toggleBouquet} style={{ opacity: 0 }}>
        <span className="bq-hint__ring" />
        <span ref={bqHint}>Clique no buquê para desmontar</span>
      </button>

      <div ref={hint} className="scroll-hint mono">
        <span>Role para montar</span>
        <i />
      </div>

      <button className={`sound mono ui-block ${sound ? 'is-on' : ''}`} onClick={toggleSound} aria-pressed={sound}>
        <span className="sound__bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        Som {sound ? 'ligado' : 'desligado'}
      </button>
    </div>
  )
}
