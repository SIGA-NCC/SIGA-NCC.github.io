// movimentos.js — aba Movimentos: histórico de entradas, saídas e cestas.
// O backend devolve os últimos N; filtro por tipo, busca e agrupamento por dia são no aparelho.

import { esc, fmtNum, hoje as hojeLocal } from './ui.js';
import { cascata } from './fx.js';

let C = null;
let todos = [];
let tipo = '';

const ROTULO = {
  ENTRADA: 'Entradas', SAIDA: 'Saídas avulsas', CESTA: 'Cestas montadas', ENTREGA: 'Cestas entregues',
  TRANSFERENCIA: 'Mudanças de lugar', DESCARTE: 'Baixas (perdas)', AJUSTE: 'Ajustes'
};
const UM = { ENTRADA: 'Entrada', SAIDA: 'Saída', CESTA: 'Cesta', ENTREGA: 'Entrega', TRANSFERENCIA: 'Mudou de lugar', AJUSTE: 'Ajuste', DESCARTE: 'Baixa' };
const CLASSE = { ENTRADA: 'ok', SAIDA: 'ambar', CESTA: 'ok', ENTREGA: 'ok', TRANSFERENCIA: '', AJUSTE: '', DESCARTE: 'riso' };
const PAGINA = 40;
let periodo = '30';
let mostrar = PAGINA;
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

export function iniciarMovimentos(ctx) {
  C = ctx;
  $('#m-chips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    tipo = c.dataset.tipo;
    render(true);
  });
  let t;
  $('#m-busca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { mostrar = PAGINA; render(false); }, 120); });
  $('#m-periodo').addEventListener('click', (e) => {
    const c = e.target.closest('[data-per]');
    if (!c) return;
    periodo = c.dataset.per;
    $$('#m-periodo [data-per]').forEach(b => b.setAttribute('aria-pressed', String(b === c)));
    $('#m-datas').hidden = periodo !== 'datas';
    mostrar = PAGINA;
    render(true);
  });
  ['#m-de', '#m-ate'].forEach(id => $(id).addEventListener('change', () => { mostrar = PAGINA; render(true); }));
  $('#m-mais').addEventListener('click', () => { mostrar += PAGINA; render(false); });
  $('#btn-atualizar-mov').addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true; b.classList.add('carregando');
    try { await atualizarMovimentos(); } catch (e) { C.toast(e.message, 'erro'); }
    b.disabled = false; b.classList.remove('carregando');
  });
}

export async function atualizarMovimentos() {
  if (!C) return;
  const r = await C.chamar({ action: 'movimentos_listar', limite: 300 });
  const tb = $('#corpo-movimentos');
  if (!r.ok) { tb.innerHTML = `<tr><td colspan="6" class="vazio">${esc(r.error)}</td></tr>`; return; }
  todos = r.movimentos || [];
  render(true);
}

const diaLocal = (iso) => {
  const d = new Date(String(iso));
  if (isNaN(d)) return String(iso).slice(0, 10);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
function rotuloDia(dia) {
  const hoje = hojeLocal();
  const ontem = diaLocal(new Date(Date.now() - 86400000));
  if (dia === hoje) return 'Hoje';
  if (dia === ontem) return 'Ontem';
  const d = new Date(dia + 'T12:00:00');
  return isNaN(d) ? dia : d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}
const hora = (iso) => {
  const d = new Date(String(iso));
  return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

// período escolhido → [de, ate] em AAAA-MM-DD (datas locais)
function intervalo() {
  const hj = hojeLocal();
  const menos = (n) => diaLocal(new Date(Date.now() - n * 86400000));
  if (periodo === 'hoje') return [hj, hj];
  if (periodo === '7') return [menos(6), hj];
  if (periodo === '30') return [menos(29), hj];
  if (periodo === 'mes') return [hj.slice(0, 8) + '01', hj];
  if (periodo === 'datas') return [$('#m-de').value || '', $('#m-ate').value || ''];
  return ['', ''];
}

function render(animar) {
  const termo = $('#m-busca').value.trim().toLowerCase();
  const [de, ate] = intervalo();
  const noPeriodo = todos.filter(m => { const d = diaLocal(m.timestamp); return (!de || d >= de) && (!ate || d <= ate); });
  const buscados = termo
    ? noPeriodo.filter(m => [m.produto, m.quem, m.observacao, m.destinatario, m.local].some(v => String(v || '').toLowerCase().includes(termo)))
    : noPeriodo;

  // chips com contagem (respeitam a busca)
  const cont = {};
  buscados.forEach(m => { cont[m.tipo] = (cont[m.tipo] || 0) + 1; });
  const tipos = Object.keys(ROTULO).filter(t => cont[t]);
  if (tipo && !cont[tipo]) tipo = '';
  $('#m-chips').innerHTML =
    `<button type="button" class="chip" data-tipo="" aria-pressed="${tipo === ''}">Todos<small>${buscados.length}</small></button>` +
    tipos.map(t => `<button type="button" class="chip" data-tipo="${t}" aria-pressed="${tipo === t}">${ROTULO[t]}<small>${cont[t]}</small></button>`).join('');

  const lista = tipo ? buscados.filter(m => m.tipo === tipo) : buscados;
  const tb = $('#corpo-movimentos');

  // resumo do dia
  const hojeStr = hojeLocal();
  const hojeMov = todos.filter(m => diaLocal(m.timestamp) === hojeStr);
  const e = hojeMov.filter(m => m.tipo === 'ENTRADA').length;
  const c = hojeMov.filter(m => m.tipo === 'CESTA').length;
  $('#m-resumo').innerHTML = hojeMov.length
    ? `Hoje: <b>${e}</b> entrada(s) · <b>${c}</b> cesta(s) montada(s)`
    : 'Nada registrado hoje ainda.';

  const mais = $('#m-mais');
  if (!lista.length) {
    tb.innerHTML = `<tr><td colspan="6" class="vazio">${termo ? 'Nada encontrado para “' + esc(termo) + '”.' : 'Nenhum movimento neste período.'}</td></tr>`;
    mais.hidden = true;
    return;
  }
  mais.hidden = lista.length <= mostrar;
  mais.textContent = 'Mostrar mais (' + Math.min(PAGINA, lista.length - mostrar) + ' de ' + (lista.length - mostrar) + ' restantes)';

  let html = '';
  let diaAtual = '';
  lista.slice(0, mostrar).forEach(m => {
    const dia = diaLocal(m.timestamp);
    if (dia !== diaAtual) {
      diaAtual = dia;
      html += `<tr class="dia"><td colspan="6">${esc(rotuloDia(dia))}</td></tr>`;
    }
    const cls = CLASSE[m.tipo] != null ? CLASSE[m.tipo] : '';
    const alvo = m.destinatario ? esc(m.destinatario) : '';
    const sinal = m.tipo === 'ENTRADA' ? 'mais' : (m.tipo === 'SAIDA' || m.tipo === 'DESCARTE' ? 'menos' : '');
    const prefixo = sinal === 'mais' ? '+' : (sinal === 'menos' ? '−' : '');
    const qtd = m.tipo === 'CESTA'
      ? esc(fmtNum(m.qtd)) + ' itens' + (alvo ? ' → ' + alvo : '')
      : prefixo + esc(fmtNum(m.qtd)) + ' ' + esc(m.unidade);
    html += `<tr>
      <td data-c="info">${esc(hora(m.timestamp))}</td>
      <td data-c="tipo"><span class="badge ${cls}">${esc(UM[m.tipo] || m.tipo)}</span></td>
      <td data-c="produto">${m.produto ? esc(m.produto) : (m.tipo === 'CESTA' || m.tipo === 'ENTREGA' ? 'Cesta' : esc(m.produto_id || '—'))}${m.local ? '<span class="mov-extra">' + esc(m.local) + '</span>' : ''}</td>
      <td data-c="qtd"><span class="qtd-mov ${sinal}">${qtd}</span></td>
      <td data-c="info">${m.quem ? esc(m.quem) : '—'}</td>
      <td data-c="info">${m.observacao ? esc(m.observacao) : ''}</td>
    </tr>`;
  });
  tb.innerHTML = html;
  if (animar) cascata(tb);
}
