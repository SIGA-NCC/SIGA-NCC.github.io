// ui.js — helpers de formatação e HTML compartilhados entre as telas.

export function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export function fmtData(iso) {
  if (!iso) return '—';
  const s = String(iso);
  const dia = s.slice(0, 10);
  const d = new Date(dia + 'T12:00:00');
  if (isNaN(d)) return dia;
  return d.toLocaleDateString('pt-BR');
}

export function fmtDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso));
  if (isNaN(d)) return String(iso).slice(0, 16).replace('T', ' ');
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function fmtNum(n) {
  const v = Number(n);
  if (isNaN(v)) return n == null ? '' : String(n);
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export function hoje() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
