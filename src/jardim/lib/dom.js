// Escritas de DOM só quando o valor muda: escrever o mesmo estilo a cada quadro ainda
// invalida estilo/layout no navegador — no celular, isso vira travada.
const last = new WeakMap()

function memo(el) {
  let m = last.get(el)
  if (!m) last.set(el, (m = {}))
  return m
}

export function setStyle(el, prop, value) {
  if (!el) return
  const m = memo(el)
  if (m[prop] === value) return
  m[prop] = value
  if (prop.startsWith('--')) el.style.setProperty(prop, value)
  else el.style[prop] = value
}

export function setText(el, value) {
  if (el && el.textContent !== value) el.textContent = value
}

export function setClass(el, cls, on) {
  if (!el) return
  const m = memo(el)
  const k = 'class:' + cls
  if (m[k] === on) return
  m[k] = on
  el.classList.toggle(cls, on)
}
