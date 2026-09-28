import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { state, smooth, invLerp, clamp, toggleBouquet } from '../store.js'
import { enableSound } from '../lib/audio.js'
import { scrollToProgress, scrollToTop } from '../lib/scroll.js'
import { buildWhatsAppUrl } from '../../utils/whatsapp.js'
import { setStyle, setText, setClass } from '../lib/dom.js'

const NUM = ['zero', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez']
const TENS = { 20: 'vinte', 30: 'trinta', 40: 'quarenta' }
const extenso = (n) => (n <= 10 ? NUM[n] : n % 10 === 0 ? TENS[n] : `${TENS[n - (n % 10)]} e ${NUM[n % 10]}`)
const cap = (s) => s[0].toUpperCase() + s.slice(1)


// Capítulos: [entra, sai]. A opacidade e o deslocamento vêm do progresso suavizado.
const CHAPTERS = [
  { id: 'void', a: -1, b: 0.085, step: '01' },
  { id: 'stem', a: 0.15, b: 0.285, step: '02' },
  { id: 'bloom', a: 0.315, b: 0.47, step: '03' },
  { id: 'reveal', a: 0.5, b: 0.6, step: '04' },
  { id: 'garden', a: 0.62, b: 0.83, step: '04' },
  { id: 'bouquet', a: 0.885, b: 2, step: '05' },
]
// p = destino do clique; from = a partir de quando o item fica ativo
const NAV = [
  { label: 'Solto', p: 0, from: 0 },
  { label: 'Caule', p: 0.2, from: 0.1 },
  { label: 'Flor', p: 0.43, from: 0.3 },
  { label: 'Jardim', p: 0.6, from: 0.49 },
  { label: 'Buquê', p: 0.95, from: 0.86 },
]

// Linha de título revelada por máscara; --i ordena a cascata (ver .line em styles.css)
const Line = ({ i, children }) => (
  <span className="line" style={{ '--i': i }}>
    <span className="line__in">{children}</span>
  </span>
)

// contato: o mesmo WhatsApp do site anterior (variável VITE_WHATSAPP_NUMBER na Vercel)
const PHONE = import.meta.env.VITE_WHATSAPP_NUMBER
const whats = (message) => (PHONE ? buildWhatsAppUrl({ phone: PHONE, message }) : null)

const pad = (n, l = 3) => String(Math.max(0, Math.round(n))).padStart(l, '0')

export default function Overlay({ projects, bom = { bars: 9, plates: 8, slopes: 10, leaves: 2, petals: 27 } }) {
  const refs = useRef({})
  const counter = useRef()
  const total = useRef()
  const stepEl = useRef()
  const bar = useRef()
  const bqHint = useRef()
  const bqBtn = useRef()
  const scrimLight = useRef()
  const scrimDark = useRef()
  const hero = useRef()
  const heroMedia = useRef()
  const heroText = useRef()
  const status = useRef()
  const chrome = useRef([])
  const navRefs = useRef([])
  const [sound, setSound] = useState(false)
  const [ready, setReady] = useState(false) // animação pronta para rolar
  const [failed, setFailed] = useState(false)
  state.labelEls = state.labelEls || []

  // carregamento em segundo plano enquanto o hero está na tela
  useEffect(() => {
    const onProgress = (e) => setText(status.current, `Separando peças · ${Math.round(Math.min(1, e.detail / 0.8) * 100)}%`)
    const done = () => setReady(true)
    const onError = () => setFailed(true)
    if (state.ready) done()
    window.addEventListener('jardim:progress', onProgress)
    window.addEventListener('jardim:ready', done)
    window.addEventListener('jardim:error', onError)
    return () => {
      window.removeEventListener('jardim:progress', onProgress)
      window.removeEventListener('jardim:ready', done)
      window.removeEventListener('jardim:error', onError)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const intro = { v: 0 }
    const touch = window.matchMedia('(pointer: coarse)').matches
    const f3 = (v) => v.toFixed(3)
    const tick = () => {
      const P = state.p
      // ---- hero: ao rolar, a imagem aproxima (zoom) e se dissolve no escuro da experiência ----
      const H = state.hero
      const heroOut = smooth(invLerp(0.4, 0.9, H))
      setStyle(hero.current, 'visibility', H > 0.995 ? 'hidden' : 'visible')
      if (H <= 0.995) {
        setStyle(hero.current, 'opacity', f3(1 - heroOut))
        setStyle(heroMedia.current, 'transform', `scale(${(1 + 0.22 * smooth(H)).toFixed(4)})`)
        setStyle(heroText.current, 'transform', `translate3d(0, ${(-60 * H).toFixed(1)}px, 0)`)
        setStyle(heroText.current, 'opacity', f3(1 - smooth(invLerp(0.05, 0.5, H))))
      }
      // o primeiro capítulo só se revela quando o hero sai e a animação está pronta
      intro.v = Math.min(smooth(invLerp(0.55, 1, H)), state.ready ? 1 : 0)
      state.intro = intro.v
      // cabeçalho de progresso e trilho aparecem com a experiência
      const ch = f3(smooth(invLerp(0.6, 1, H)))
      for (const el of chrome.current) setStyle(el, 'opacity', ch)
      let scrim = 0
      for (const c of CHAPTERS) {
        const el = refs.current[c.id]
        if (!el) continue
        const fin = c.a < 0 ? 1 : smooth(invLerp(c.a, c.a + 0.03, P))
        const fout = smooth(invLerp(c.b - 0.03, c.b, P))
        const o = fin * (1 - fout)
        const cin = c.id === 'void' ? Math.min(fin, state.intro ?? 1) : fin
        const hidden = cin < 0.01 || fout > 0.99
        setStyle(el, 'visibility', hidden ? 'hidden' : 'visible')
        scrim = Math.max(scrim, c.id === 'garden' ? o * 0.6 : o)
        if (hidden) continue // capítulo fora da tela: nada a atualizar
        setStyle(el, 'opacity', f3(Math.min(1, cin * 3) * (1 - fout) ** 1.6))
        setStyle(el, '--cin', f3(cin))
        setStyle(el, '--cout', f3(fout))
        setClass(el, 'is-on', cin > 0.6 && fout < 0.4)
        // lista de peças conta de 0 até o total, como num manual
        if (c.id === 'stem') for (const b of el.querySelectorAll('b[data-n]')) setText(b, Math.round(+b.dataset.n * clamp(cin * 1.5 - 0.3)) + '×')
      }
      const cur = [...CHAPTERS].reverse().find((c) => P >= c.a - 0.02) || CHAPTERS[0]
      setText(stepEl.current, cur.step)
      setText(counter.current, pad((state.built || 0) + (state.bouquetAssembled || 0), 4))
      setText(total.current, pad(state.totalPieces || 0, 4))
      setStyle(bar.current, 'transform', `scaleY(${clamp(state.progress).toFixed(3)})`)
      const light = smooth(invLerp(0.085, 0.2, P))
      // variáveis globais: só mudam durante a transição escuro → claro
      setStyle(root, '--light', light.toFixed(2))
      // texto escuro sobre o hero claro; claro no escuro da experiência
      setStyle(root, '--tl', Math.max(smooth(invLerp(0.42, 0.62, light)), 1 - smooth(invLerp(0.35, 0.7, H))).toFixed(2))
      // degradês de legibilidade: camadas próprias, só opacidade (compositor)
      setStyle(scrimLight.current, 'opacity', (light * (0.35 + scrim * 0.55)).toFixed(2))
      setStyle(scrimDark.current, 'opacity', (1 - light).toFixed(2))
      navRefs.current.forEach((el, i) => {
        const next = NAV[i + 1]?.from ?? 2
        setClass(el, 'is-active', P >= NAV[i].from && P < next)
      })
      if (bqBtn.current) {
        const o = smooth(invLerp(0.9, 0.93, P))
        setStyle(bqBtn.current, 'opacity', f3(o))
        setStyle(bqBtn.current, 'pointerEvents', o > 0.5 ? 'auto' : 'none')
      }
      const m = state.bouquet.mode
      setText(
        bqHint.current,
        m === 'idle'
          ? touch
            ? 'Toque ou chacoalhe para desmontar'
            : 'Clique no buquê para desmontar'
          : m === 'exploded'
            ? touch
              ? 'Toque para remontar'
              : 'Clique para remontar'
            : 'Remontando…',
      )
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
      <div ref={scrimDark} className="scrim scrim--dark" aria-hidden="true" />
      <div ref={scrimLight} className="scrim scrim--light" aria-hidden="true" />
      <section ref={hero} className="hero" aria-labelledby="hero-title">
        <picture className="hero__media" aria-hidden="true">
          <source media="(orientation: portrait)" srcSet="/seq/hero-mobile.avif" type="image/avif" />
          <source media="(orientation: portrait)" srcSet="/seq/hero-mobile.webp" type="image/webp" />
          <source srcSet="/seq/hero-desktop.avif" type="image/avif" />
          <img ref={heroMedia} src="/seq/hero-desktop.webp" alt="" fetchpriority="high" decoding="async" />
        </picture>
        <div ref={heroText} className="hero__text">
          <p className="kicker mono">Helena Costa — Arquitetura e interiores</p>
          <h1 id="hero-title">
            Projetos que se montam
            <em> peça por peça.</em>
          </h1>
          <p className="hero__lede">
            Estrutura, detalhe e cuidado: é assim que um lugar ganha forma. Aqui embaixo, centenas de peças soltas viram uma flor — e
            depois um jardim inteiro, onde cada canteiro é um projeto.
          </p>
          <div className="hero__foot">
            {whats('Gostaria de começar um projeto.') && (
              <a className="btn btn--solid" href={whats('Gostaria de começar um projeto.')} target="_blank" rel="noopener noreferrer">
                Iniciar um projeto
              </a>
            )}
            {failed ? (
              <span className="hero__status mono">
                Não foi possível carregar as peças ·{' '}
                <button className="hero__retry mono" onClick={() => location.reload()}>
                  Tentar de novo
                </button>
              </span>
            ) : (
              <span ref={status} className={`hero__status mono ${ready ? 'is-done' : ''}`}>
                Separando peças
              </span>
            )}
          </div>
        </div>
      </section>

      <header className="top">
        <a
          className="brand ui-block"
          href="#"
          aria-label="Helena Costa Arquitetura — voltar ao início"
          onClick={(e) => {
            e.preventDefault()
            scrollToTop()
          }}
        >
          <span className="brand__mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span className="brand__name">
            Helena Costa<em>Arquitetura</em>
          </span>
        </a>
        <div ref={(el) => (chrome.current[0] = el)} className="meta mono">
          <span>
            Passo <b ref={stepEl}>01</b>/05
          </span>
          <span className="meta__count">
            <b ref={counter}>0000</b>/<span ref={total}>0000</span> peças
          </span>
        </div>
      </header>

      <nav ref={(el) => (chrome.current[1] = el)} className="rail ui-block" aria-label="Capítulos">
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
        <p className="kicker mono rv" style={{ '--i': -0.6 }}>Botânica Modular — portfólio em peças</p>
        <h1>
          <Line i={0}>Tudo começa</Line>
          <Line i={1}><em>solto.</em></Line>
        </h1>
        <p className="lede rv" style={{ '--i': 2.2 }}>
          Centenas de peças no escuro e nenhuma instrução. {window.matchMedia('(pointer: coarse)').matches ? 'Incline o celular' : 'Mova o mouse'}: a luz é você.
        </p>
      </section>

      <section ref={(el) => (refs.current.stem = el)} className="ch ch--stem">
        <p className="kicker mono rv" style={{ '--i': -0.6 }}>Passo 02 — Estrutura</p>
        <h2>
          <Line i={0}>Antes da flor,</Line>
          <Line i={1}><em>a estrutura.</em></Line>
        </h2>
        <p className="lede rv" style={{ '--i': 2.2 }}>Todo projeto nasce do que não se vê: eixo, apoio, encaixe. Um caule é arquitetura em miniatura.</p>
        <ul className="bom mono rv" style={{ '--i': 3 }} aria-label="Lista de peças">
          <li>
            <b data-n={bom.bars}>{bom.bars}×</b> barra
          </li>
          <li>
            <b data-n={bom.plates}>{bom.plates}×</b> peça redonda 1×1
          </li>
          <li>
            <b data-n={bom.slopes}>{bom.slopes}×</b> slope 45° 1×2
          </li>
          <li>
            <b data-n={bom.leaves}>{bom.leaves}×</b> folha curva 3×5
          </li>
        </ul>
      </section>

      <section ref={(el) => (refs.current.bloom = el)} className="ch ch--bloom">
        <p className="kicker mono rv" style={{ '--i': -0.6 }}>Passo 03 — Desabrochar</p>
        <h2>
          <Line i={0}>Peça por peça,</Line>
          <Line i={1}><em>a forma aparece.</em></Line>
        </h2>
        <p className="lede rv" style={{ '--i': 2.2 }}>
          {cap(extenso(bom.petals))} placas curvas, cada uma no seu ângulo. O detalhe é o que transforma estrutura em lugar.
        </p>
      </section>

      <section ref={(el) => (refs.current.reveal = el)} className="ch ch--reveal">
        <p className="kicker mono rv" style={{ '--i': -0.6 }}>Passo 04 — Jardim</p>
        <h2>
          <Line i={0}>Arquitetura</Line>
          <Line i={1}><em>é cultivar.</em></Line>
        </h2>
        <p className="lede rv" style={{ '--i': 2.2 }}>Cada canteiro deste jardim é um projeto. Caminhe entre eles.</p>
      </section>

      <section ref={(el) => (refs.current.garden = el)} className="ch ch--garden">
        <p className="kicker mono rv" style={{ '--i': -0.6 }}>Passo 04 — Projetos selecionados</p>
      </section>

      {projects.map((p, i) => {
        // cada canteiro é um projeto: com WhatsApp configurado, o cartão abre a conversa
        const link = whats(`Vi o projeto "${p.title}" no portfólio e gostaria de conversar.`)
        const Tag = link ? 'a' : 'div'
        return (
          <Tag
            key={p.id}
            ref={(el) => (state.labelEls[i] = el)}
            className="tag ui-block"
            {...(link ? { href: link, target: '_blank', rel: 'noopener noreferrer' } : {})}
            style={{ opacity: 0 }}
          >
            <span className="tag__dot" />
            <span className="tag__line" />
            <span className="tag__card">
              <span className="mono">
                Canteiro {String(i + 1).padStart(2, '0')} · {p.category}
              </span>
              <strong>{p.title}</strong>
              {link && <span className="tag__cta mono">Conversar sobre este projeto →</span>}
            </span>
          </Tag>
        )
      })}

      <section ref={(el) => (refs.current.bouquet = el)} className="ch ch--bouquet">
        <p className="kicker mono rv" style={{ '--i': -0.6 }}>Passo 05 — Buquê</p>
        <h2>
          <Line i={0}>Monte. Desmonte.</Line>
          <Line i={1}><em>Recomece.</em></Line>
        </h2>
        <p className="lede rv" style={{ '--i': 2.2 }}>Um bom projeto é feito de partes que podem ser repensadas. Vamos montar o seu?</p>
        <div className="actions ui-block rv" style={{ '--i': 3 }}>
          {whats('Gostaria de começar um projeto.') && (
            <a className="btn btn--solid" href={whats('Gostaria de começar um projeto.')} target="_blank" rel="noopener noreferrer">
              Iniciar um projeto
            </a>
          )}
          <button className={`btn ${PHONE ? '' : 'btn--solid'}`} onClick={() => scrollToProgress(0)}>
            Montar de novo
          </button>
        </div>
      </section>

      <button ref={bqBtn} className="bq-hint mono ui-block" onClick={toggleBouquet} style={{ opacity: 0 }}>
        <span className="bq-hint__ring" />
        <span ref={bqHint}>Clique no buquê para desmontar</span>
      </button>

      <button className={`sound mono ui-block ${sound ? 'is-on' : ''}`} onClick={toggleSound} aria-pressed={sound}>
        <span className="sound__bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        Som <span className="sound__state">{sound ? 'ligado' : 'desligado'}</span>
      </button>
    </div>
  )
}
