// estoque-mapa.js — aba Estoque como mapa das prateleiras (D8: 6 estantes de ferro × topo + níveis A, B, C).
// Navegação em 3 passos: todas as estantes → uma estante → um nível (lotes com "Dar baixa" e "Mudar de lugar").
// Busca por produto (mostra todos os endereços onde ele está) ou por endereço (P2-B, T3).

import { esc, fmtNum, fmtData, hoje } from './ui.js';
import { cascata } from './fx.js';
import { abrirDialogo, fecharDialogo } from './sigma-dialogo.js';

const ESTANTES = [1, 2, 3, 4, 5, 6];
const NIVEIS = [
  { cod: (n) => 'T' + n, nome: 'Topo' },
  { cod: (n) => 'P' + n + '-A', nome: 'Nível A' },
  { cod: (n) => 'P' + n + '-B', nome: 'Nível B' },
  { cod: (n) => 'P' + n + '-C', nome: 'Nível C' }
];
const TODOS_LOCAIS = ESTANTES.flatMap(n => NIVEIS.map(v => v.cod(n)));
const MOTIVOS_BAIXA = [['RASGADO', 'Rasgado'], ['MOFADO', 'Mofado'], ['ESTRAGADO', 'Estragado'], ['VENCIDO', 'Vencido'], ['AVARIADO', 'Avariado'], ['OUTRO', 'Outro']];
const MOTIVOS_MOVER = [['ORGANIZACAO', 'Organização'], ['LIMPEZA', 'Limpeza'], ['QUANTIDADE', 'Falta de espaço / quantidade'], ['OUTRO', 'Outro']];

let C = null;
let lotes = [];
let vista = { estante: null, local: null }; // null/null = visão geral
const $ = (s) => document.querySelector(s);

const SEM = 'SEM'; // "local" dos lotes guardados sem endereço
const nomeLocal = (cod) => {
  if (!cod || cod === SEM) return 'Sem lugar definido';
  const t = /^T(\d)$/i.exec(cod);
  if (t) return 'Prateleira ' + t[1] + ' · Topo';
  const p = /^P(\d)-([ABC])$/i.exec(cod);
  return p ? 'Prateleira ' + p[1] + ' · Nível ' + p[2].toUpperCase() : cod;
};
const estanteDe = (cod) => { const m = /^[PT](\d)/i.exec(cod || ''); return m ? Number(m[1]) : null; };
const ehLocal = (txt) => TODOS_LOCAIS.includes(String(txt || '').trim().toUpperCase());
// data local (toISOString é UTC — E10)
const d30 = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

function estadoLote(l) {
  if (!l.validade) return '';
  if (l.validade < hoje()) return 'vencido';
  return l.validade <= d30() ? 'vencendo' : '';
}
const lotesEm = (cod) => cod === SEM ? lotes.filter(l => !l.local) : lotes.filter(l => (l.local || '').toUpperCase() === (cod || '').toUpperCase());

export function iniciarEstoqueMapa(ctx) {
  C = ctx;
  const busca = $('#mapa-busca');
  let t;
  busca.addEventListener('input', () => { clearTimeout(t); t = setTimeout(renderBusca, 120); });
  busca.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && ehLocal(busca.value)) { e.preventDefault(); irPara(busca.value.trim().toUpperCase()); }
  });
  $('#mapa-trilha').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ir]');
    if (!b) return;
    const ir = b.dataset.ir;
    if (ir === 'geral') vista = { estante: null, local: null };
    else vista = { estante: Number(ir), local: null };
    render(true);
  });
  $('#mapa').addEventListener('click', (e) => {
    const nivel = e.target.closest('[data-local]');
    const est = e.target.closest('[data-estante]');
    if (nivel) irPara(nivel.dataset.local);
    else if (est) { vista = { estante: Number(est.dataset.estante), local: null }; render(true); }
  });
  $('#mapa-resultado').addEventListener('click', (e) => {
    const b = e.target.closest('[data-local]');
    if (b) irPara(b.dataset.local);
  });
  $('#mapa-detalhe').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    const l = lotes.find(x => x.id_lote === b.dataset.id);
    if (!l) return;
    if (b.dataset.acao === 'baixa') dialogoBaixa(l); else dialogoMover(l);
  });
}

export async function atualizarEstoqueMapa() {
  if (!C) return;
  const r = await C.chamar({ action: 'estoque_listar', situacao: 'ATIVO' });
  if (!r.ok) throw new Error(r.error);
  lotes = (r.lotes || []).filter(l => Number(l.qtd) > 0);
  render(false);
  renderBusca();
}

function irPara(cod) {
  vista = { estante: estanteDe(cod), local: cod };
  render(true);
  $('#mapa-trilha').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resumoNivel(cod) {
  const ls = lotesEm(cod);
  const venc = ls.filter(l => estadoLote(l) === 'vencido').length;
  const perto = ls.filter(l => estadoLote(l) === 'vencendo').length;
  const produtos = [...new Set(ls.map(l => l.produto))];
  return { ls, venc, perto, produtos };
}

function marcas(r) {
  return (r.venc ? `<span class="pino riso" title="${r.venc} lote(s) vencido(s)"></span>` : '') +
    (r.perto ? `<span class="pino ambar" title="${r.perto} lote(s) vencendo"></span>` : '');
}

function render(animar) {
  const mapa = $('#mapa');
  const termo = $('#mapa-busca').value.trim().toLowerCase();
  const achados = new Set(termo && !ehLocal(termo)
    ? lotes.filter(l => String(l.produto).toLowerCase().includes(termo)).map(l => (l.local || '').toUpperCase())
    : []);

  // trilha (onde estou)
  const partes = ['<button type="button" data-ir="geral">Todas as prateleiras</button>'];
  if (vista.estante) partes.push(`<button type="button" data-ir="${vista.estante}">Prateleira ${vista.estante}</button>`);
  if (vista.local) partes.push(`<span aria-current="page">${esc(nomeLocal(vista.local).split(' · ')[1] || 'Sem lugar')}</span>`);
  $('#mapa-trilha').innerHTML = partes.join('<span class="sep" aria-hidden="true">›</span>');

  if (!vista.estante && !vista.local) {
    // passo 1: todas as estantes
    const semLocal = lotes.filter(l => !l.local);
    mapa.className = 'mapa geral';
    mapa.innerHTML = ESTANTES.map(n => {
      const niveis = NIVEIS.map(v => {
        const cod = v.cod(n);
        const r = resumoNivel(cod);
        return `<div class="tabua ${r.ls.length ? 'cheia' : ''} ${achados.has(cod) ? 'achado' : ''}">
          <span class="tabua-nome">${v.nome === 'Topo' ? 'Topo' : v.nome.slice(-1)}</span>
          <span class="tabua-qtd">${r.ls.length ? r.produtos.length + ' prod.' : '—'}</span>${marcas(r)}
        </div>`;
      }).join('');
      const total = NIVEIS.reduce((a, v) => a + resumoNivel(v.cod(n)).ls.length, 0);
      return `<button type="button" class="estante" data-estante="${n}" aria-label="Prateleira ${n}: ${total} lote(s)">
        <span class="estante-nome">Prateleira ${n}</span>
        <span class="estante-corpo">${niveis}</span>
        <span class="estante-pes" aria-hidden="true"></span>
      </button>`;
    }).join('') + (semLocal.length ? `<button type="button" class="sem-local" data-local="${SEM}">
        <b>${semLocal.length}</b> lote(s) sem lugar definido <span>ver ›</span></button>` : '');
    $('#mapa-detalhe').hidden = true;
  } else if (vista.estante && !vista.local) {
    // passo 2: uma estante grande, com os produtos de cada nível
    mapa.className = 'mapa zoom';
    mapa.innerHTML = `<div class="estante grande"><span class="estante-nome">Prateleira ${vista.estante}</span><span class="estante-corpo">` +
      NIVEIS.map(v => {
        const cod = v.cod(vista.estante);
        const r = resumoNivel(cod);
        const chips = r.produtos.slice(0, 6).map(p => `<span class="mini-chip">${esc(p)}</span>`).join('') +
          (r.produtos.length > 6 ? `<span class="mini-chip">+${r.produtos.length - 6}</span>` : '');
        return `<button type="button" class="tabua grande ${r.ls.length ? 'cheia' : ''} ${achados.has(cod) ? 'achado' : ''}" data-local="${cod}">
          <span class="tabua-topo"><b>${v.nome}</b> <small>${cod}</small>${marcas(r)}<span class="seta" aria-hidden="true">›</span></span>
          <span class="tabua-itens">${chips || '<em>vazio</em>'}</span>
        </button>`;
      }).join('') + '</span><span class="estante-pes" aria-hidden="true"></span></div>';
    $('#mapa-detalhe').hidden = true;
  } else {
    // passo 3: um nível — lotes com ações
    mapa.className = 'mapa oculto';
    mapa.innerHTML = '';
    renderDetalhe(vista.local);
  }
  if (animar) cascata(mapa);
}

function renderDetalhe(cod) {
  const box = $('#mapa-detalhe');
  box.hidden = false;
  const ls = lotesEm(cod);
  box.innerHTML = `<h3>${esc(nomeLocal(cod))} ${cod !== SEM ? `<small>${esc(cod)}</small>` : ''}</h3>` + (ls.length
    ? `<ul class="lista lotes-local">${ls.map(l => {
        const est = estadoLote(l);
        const val = l.validade ? `<span class="badge ${est === 'vencido' ? 'riso' : est === 'vencendo' ? 'ambar' : ''}">${est === 'vencido' ? 'venceu ' : 'val. '}${fmtData(l.validade)}</span>` : '<span class="badge">sem validade</span>';
        return `<li>
          <span class="esq"><span class="forte">${esc(l.produto)} · ${fmtNum(l.qtd)} ${esc(l.unidade)}</span>
          <span class="fraco">${esc(l.id_lote)}${l.doador ? ' · ' + esc(l.doador) : ''} · entrou ${fmtData(l.data_entrada)}</span>${val}</span>
          <span class="dir acoes-lote">
            <button type="button" class="btn-mini" data-acao="mover" data-id="${esc(l.id_lote)}">Mudar de lugar</button>
            <button type="button" class="btn-mini perigo" data-acao="baixa" data-id="${esc(l.id_lote)}">Dar baixa</button>
          </span>
        </li>`;
      }).join('')}</ul>`
    : '<p class="vazio">Nada guardado aqui. Na aba Receber, escolha este local ao registrar uma doação.</p>');
  cascata(box.querySelector('.lista'));
}

function renderBusca() {
  const termo = $('#mapa-busca').value.trim();
  const box = $('#mapa-resultado');
  if (!termo) { box.innerHTML = ''; render(false); return; }
  if (ehLocal(termo)) {
    const cod = termo.toUpperCase();
    box.innerHTML = `<button type="button" class="achado-linha" data-local="${cod}"><b>${esc(nomeLocal(cod))}</b> — ${lotesEm(cod).length} lote(s) <span>abrir ›</span></button>`;
    render(false);
    return;
  }
  const t = termo.toLowerCase();
  const porProduto = {};
  lotes.filter(l => String(l.produto).toLowerCase().includes(t)).forEach(l => {
    const p = (porProduto[l.produto] = porProduto[l.produto] || {});
    const k = l.local || SEM;
    p[k] = p[k] || { qtd: 0, unidade: l.unidade };
    p[k].qtd += Number(l.qtd) || 0;
  });
  const nomes = Object.keys(porProduto);
  box.innerHTML = nomes.length
    ? nomes.map(n => `<div class="achado-prod"><b>${esc(n)}</b> está em:
        ${Object.entries(porProduto[n]).map(([k, v]) => `<button type="button" class="chip" data-local="${k}">${k !== SEM ? esc(k) : 'sem lugar'} · ${fmtNum(v.qtd)} ${esc(v.unidade)}</button>`).join('')}
      </div>`).join('')
    : `<p class="vazio">Nenhum produto com “${esc(termo)}” no estoque. Para endereço, digite assim: P2-B ou T3.</p>`;
  render(false);
}

// ---------- diálogos ----------
function chipsRadio(nome, opcoes) {
  return `<div class="chips" role="radiogroup">${opcoes.map(([v, r]) =>
    `<label class="chip-radio"><input type="radio" name="${nome}" value="${v}"><span>${r}</span></label>`).join('')}</div>`;
}

function campoQtd(l) {
  return `<label class="sg-campo">Quantidade (${esc(l.unidade)}) — tem ${fmtNum(l.qtd)}
    <input type="number" name="qtd" min="0.01" step="any" max="${l.qtd}" value="${l.qtd}" inputmode="decimal"></label>`;
}

function erroDlg(form, msg) {
  let e = form.querySelector('.erro');
  if (!e) { e = document.createElement('div'); e.className = 'erro'; e.setAttribute('role', 'alert'); form.appendChild(e); }
  e.textContent = msg;
  e.classList.remove('visivel'); void e.offsetWidth; e.classList.add('visivel');
}

function dialogoBaixa(l) {
  let form;
  abrirDialogo({
    titulo: 'Dar baixa — ' + l.produto,
    subtitulo: nomeLocal(l.local) + ' · ' + fmtNum(l.qtd) + ' ' + l.unidade + ' no lote',
    abas: [{ id: 'f', rotulo: '', render: (el) => {
      el.innerHTML = `<form class="dlg-form" onsubmit="return false">
        <p class="rotulo-lista">Por que está saindo?</p>${chipsRadio('motivo', MOTIVOS_BAIXA)}
        ${campoQtd(l)}
        <label class="sg-campo">Observação <small>(obrigatória se “Outro”)</small><input name="obs" maxlength="200" placeholder="ex.: pacote furado no transporte"></label>
      </form>`;
      form = el.querySelector('form');
    } }],
    acoes: [
      { rotulo: 'Cancelar' },
      { rotulo: 'Dar baixa', estilo: 'perigo', ocupado: 'Registrando…', ao: async () => {
        const motivo = (form.querySelector('input[name=motivo]:checked') || {}).value;
        if (!motivo) { erroDlg(form, 'Escolha o motivo.'); return false; }
        const r = await C.chamar({ action: 'estoque_baixa', id_lote: l.id_lote, qtd: form.qtd.value, motivo, observacao: form.obs.value.trim() });
        if (!r.ok) { erroDlg(form, r.error); return false; }
        C.toast('Baixa registrada: ' + fmtNum(r.qtd) + ' ' + l.unidade + ' de ' + l.produto, 'ok');
        await atualizarEstoqueMapa();
        C.aposMudarEstoque && C.aposMudarEstoque();
      } }
    ]
  });
}

function dialogoMover(l) {
  let form;
  const grade = ESTANTES.map(n => `<div class="grade-est"><span>P${n}</span>${NIVEIS.map(v => {
    const cod = v.cod(n);
    const aqui = cod === (l.local || '').toUpperCase();
    return `<label class="chip-radio mini ${aqui ? 'aqui' : ''}"><input type="radio" name="destino" value="${cod}" ${aqui ? 'disabled' : ''}><span>${v.nome === 'Topo' ? 'Topo' : v.nome.slice(-1)}</span></label>`;
  }).join('')}</div>`).join('');
  abrirDialogo({
    titulo: 'Mudar de lugar — ' + l.produto,
    subtitulo: 'Agora em ' + nomeLocal(l.local) + ' · ' + fmtNum(l.qtd) + ' ' + l.unidade,
    abas: [{ id: 'f', rotulo: '', render: (el) => {
      el.innerHTML = `<form class="dlg-form" onsubmit="return false">
        <p class="rotulo-lista">Para onde? <small>(prateleira e nível)</small></p><div class="grade-destino">${grade}</div>
        ${campoQtd(l)}
        <p class="rotulo-lista">Por quê?</p>${chipsRadio('motivo', MOTIVOS_MOVER)}
        <label class="sg-campo">Observação <small>(opcional)</small><input name="obs" maxlength="200"></label>
      </form>`;
      form = el.querySelector('form');
    } }],
    acoes: [
      { rotulo: 'Cancelar' },
      { rotulo: 'Mudar', estilo: 'ok', ocupado: 'Mudando…', ao: async () => {
        const destino = (form.querySelector('input[name=destino]:checked') || {}).value;
        const motivo = (form.querySelector('input[name=motivo]:checked') || {}).value;
        if (!destino) { erroDlg(form, 'Escolha o novo lugar.'); return false; }
        if (!motivo) { erroDlg(form, 'Escolha o motivo.'); return false; }
        const r = await C.chamar({ action: 'estoque_mover', id_lote: l.id_lote, qtd: form.qtd.value, local_destino: destino, motivo, observacao: form.obs.value.trim() });
        if (!r.ok) { erroDlg(form, r.error); return false; }
        C.toast(l.produto + ': ' + (r.origem || 'sem lugar') + ' → ' + r.destino, 'ok');
        await atualizarEstoqueMapa();
        C.aposMudarEstoque && C.aposMudarEstoque();
      } }
    ]
  });
}

export { fecharDialogo };
