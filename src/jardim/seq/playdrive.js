// Rolagem por REPRODUÇÃO (celular). Buscar quadro a quadro (currentTime a cada movimento)
// reinicia o decodificador de vídeo do aparelho a cada busca — no Android isso custa dezenas
// de ms e a imagem anda aos saltos, atrás do dedo. Tocar o vídeo é o que o celular faz de
// mais fluido, então:
//   - rolando para baixo, o vídeo normal TOCA até alcançar o dedo, com a velocidade
//     (playbackRate) ajustada à distância;
//   - rolando para cima, toca uma cópia invertida (gerada pelo ffmpeg) do mesmo jeito;
//   - parado, pausa — e deixa a outra cópia posicionada no mesmo quadro para a troca de
//     sentido ser instantânea.
// Busca (seek) só para saltos grandes (links, cliques no trilho) e ajustes de 1 quadro.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

export class PlayDriver {
  constructor(fwd, rev, n, fps) {
    this.fwd = fwd
    this.rev = rev
    this.n = n
    this.fps = fps
    this.active = fwd
    this.revReady = false
    this.switchTo = null
    this.playing = null
  }

  // quadro (na ordem normal) que o vídeo está mostrando
  frameOf(v) {
    const k = clamp(Math.floor(v.currentTime * this.fps + 1e-3), 0, this.n - 1)
    return v === this.fwd ? k : this.n - 1 - k
  }

  timeOf(v, idx) {
    const k = v === this.fwd ? idx : this.n - 1 - idx
    return (clamp(Math.round(k), 0, this.n - 1) + 0.5) / this.fps
  }

  place(v, idx) {
    if (!v.seeking) v.currentTime = this.timeOf(v, idx)
  }

  swap(B) {
    const A = this.active
    B.style.opacity = ''
    A.style.opacity = '0'
    this.active = B
  }

  // target = quadro desejado (fracionário, ordem normal). Retorna true enquanto se move.
  drive(target) {
    // trocando de sentido: espera a outra cópia chegar no quadro atual e então troca
    if (this.switchTo) {
      if (this.switchTo.seeking) return true
      this.swap(this.switchTo)
      this.switchTo = null
    }
    const A = this.active
    const cur = this.frameOf(A)
    const g = A === this.fwd ? target - cur : cur - target // quadros à frente, no sentido de A

    if (g < -1 && this.revReady) {
      // o dedo inverteu o sentido: passa para a outra cópia, já no mesmo quadro
      if (!A.paused) A.pause()
      const B = A === this.fwd ? this.rev : this.fwd
      if (this.frameOf(B) === cur && !B.seeking) this.swap(B)
      else {
        this.place(B, cur)
        this.switchTo = B
      }
      return true
    }
    if (g <= 0.6 || g > 45) {
      if (!A.paused) A.pause()
      // chegou (ou passou um pouco): ajuste fino; salto grande: busca direta
      if ((g < -0.6 || g > 45) && !A.seeking) A.currentTime = this.timeOf(A, target)
      if (g >= -0.6 && g <= 0.6) this.syncOther(cur)
      return g < -0.6 || g > 45
    }
    // alcança o dedo em ~0,08 s: mais longe, mais rápido
    const rate = clamp(g / this.fps / 0.08, 0.25, 6)
    if (Math.abs(A.playbackRate - rate) > 0.05) A.playbackRate = rate
    if (A.paused && !this.playing) {
      this.playing = A.play()
      this.playing?.catch(() => {}).finally(() => (this.playing = null))
    }
    return true
  }

  // parado: a cópia escondida espera no mesmo quadro (troca de sentido sem atraso)
  syncOther(cur) {
    if (!this.revReady) return
    const B = this.active === this.fwd ? this.rev : this.fwd
    if (!B.seeking && B.paused && this.frameOf(B) !== cur) this.place(B, cur)
  }
}
