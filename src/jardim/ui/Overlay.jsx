import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { state, smooth, invLerp, clamp, toggleBouquet } from '../store.js'
import { enableSound } from '../lib/audio.js'
import { scrollToProgress, scrollToTop } from '../lib/scroll.js'
import { buildWhatsAppUrl } from '../../utils/whatsapp.js'
import { setStyle, setText, setClass } from '../lib/dom.js'

// Tópicos: [entra, sai] na posição do scroll (0..1). Cada um entra logo depois que uma
// montagem fica completa (a animação não para: o texto só aparece por cima).
const CHAPTERS = [
  { id: 'void', a: -1, b: 0.085, step: '01' },
  { id: 'flower', a: 0.472, b: 0.545, step: '02' },
  { id: 'garden', a: 0.6, b: 0.67, step: '03' },
  { id: 'bouquet', a: 0.905, b: 2, step: '04' },
]
const FADE = 0.02
// p = destino do clique (scroll); from = a partir de quando o item fica ativo
const NAV = [
  { label: 'Solto', p: 0, from: 0 },
  { label: 'Flor', p: 0.49, from: 0.2 },
  { label: 'Jardim', p: 0.625, from: 0.55 },
  { label: 'Buquê', p: 0.97, from: 0.86 },
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

export default function Overlay({ projects }) {
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
      const S = state.sp
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
        // entra/sai por classe: a animação do texto é uma transição CSS (transform e
        // opacidade, no compositor) — nada de estilo recalculado a cada quadro do scroll
        const on = S >= c.a + FADE * 0.5 && S < c.b - FADE * 0.5 && (c.id !== 'void' || intro.v > 0.5) && !state.navigating
        setClass(el, 'is-on', on)
        if (on) scrim = 1
      }
      const cur = [...CHAPTERS].reverse().find((c) => S >= c.a - FADE) || CHAPTERS[0]
      setText(stepEl.current, cur.step)
      setText(counter.current, pad((state.built || 0) + (state.bouquetAssembled || 0), 4))
      setText(total.current, pad(state.totalPieces || 0, 4))
      setStyle(bar.current, 'transform', `scaleY(${clamp(state.scroll).toFixed(3)})`)
      const light = smooth(invLerp(0.085, 0.2, P))
      state.light = light // (testes) sem variável CSS: mudar a raiz recalcularia a página toda
      // texto escuro sobre fundo claro (hero e jardim); claro no escuro. Troca única com
      // transição de cor — uma variável global mudando a cada quadro recalcularia a página toda
      setStyle(root, '--tl', light > 0.5 || H < 0.55 ? '1' : '0')
      // degradês de legibilidade: camadas próprias, só opacidade (compositor)
      setStyle(scrimLight.current, 'opacity', (light * (0.35 + scrim * 0.55)).toFixed(2))
      setStyle(scrimDark.current, 'opacity', (1 - light).toFixed(2))
      navRefs.current.forEach((el, i) => {
        const next = NAV[i + 1]?.from ?? 2
        setClass(el, 'is-active', S >= NAV[i].from && S < next)
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
            Passo <b ref={stepEl}>01</b>/04
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

      <section ref={(el) => (refs.current.flower = el)} className="ch ch--flower">
        <p className="kicker mono rv" style={{ '--i': -0.6 }}>Passo 02 — Estrutura e detalhe</p>
        <h2>
          <Line i={0}>Peça por peça,</Line>
          <Line i={1}><em>a forma aparece.</em></Line>
        </h2>
        <p className="lede rv" style={{ '--i': 2.2 }}>Primeiro o eixo e o apoio; depois, o detalhe que transforma estrutura em lugar.</p>
      </section>

      <section ref={(el) => (refs.current.garden = el)} className="ch ch--garden">
        <p className="kicker mono rv" style={{ '--i': -0.6 }}>Passo 03 — Jardim</p>
        <h2>
          <Line i={0}>Arquitetura</Line>
          <Line i={1}><em>é cultivar.</em></Line>
        </h2>
        <p className="lede rv" style={{ '--i': 2.2 }}>Cada canteiro deste jardim é um projeto.</p>
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
        <p className="kicker mono rv" style={{ '--i': -0.6 }}>Passo 04 — Buquê</p>
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
