export function buildWhatsAppUrl({ phone, name, email, message }) {
  const p = String(phone || '').replace(/\D/g, '');
  const lines = [
    'Olá! Gostaria de falar sobre um projeto.',
    '',
    name ? `Nome: ${name}` : null,
    email ? `E-mail: ${email}` : null,
    '',
    message ? `Mensagem: ${message}` : null,
  ].filter(Boolean);

  const text = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${p}?text=${text}`;
}
