// levantamento.js — levantamento do estoque atual, prateleira por prateleira (dentro da aba Estoque).
// Fluxo de quem anda pelas prateleiras: escolhe o endereço → lança o que está ali (produto, quantidade, validade)
// → salva e marca a prateleira como conferida. O rascunho fica no aparelho (não perde se a tela fechar).
// Recontar depois: "Contar de novo" acerta a quantidade do lote (movimento AJUSTE com o antes → depois).

import { esc, fmtData, fmtNum } from './ui.js';
import { perguntar, confirmar, avisar } from './sigma-dialogo.js';
import { atualizarEstoqueMapa } from './estoque-mapa.js';

let C = null;
let status = null;      // levantamento_status
let produtos = [];
let lotes = [];         // lotes ativos (estoque_listar)
let local = null;       // endereço aberto (null = grade)
let rascunho = [];      // itens ainda não salvos do endereço aberto
const $ = (s) => document.querySelector(s);
const UNIDADES = ['kg', 'g', 'un', 'pacote', 'lata', 'garrafa', 'caixa', 'litro', 'sachê'];
const nomeLocal = (cod) => {
  const t = /^T(\d)$/.exec(cod);
  if (t) return 'Prateleira ' + t[1] + ' · Topo';
  const p = /^P(\d)-([ABC])$/.exec(cod);
  return p ? 'Prateleira ' + p[1] + ' · Nível ' + p[2] : cod;
};
const chaveRasc = (l) => 'siga:lev:' + ((C.usuario && C.usuario.login) || '') + ':' + l;
const lerRasc = (l) => { try { return JSON.parse(localStorage.getItem(chaveRasc(l)) || '[]'); } catch (e) { return []; } };
const gravarRasc = () => { try { if (rascunho.length) localStorage.setItem(chaveRasc(local), JSON.stringify(rascunho)); else localStorage.removeItem(chaveRasc(local)); } catch (e) { /* sem storage: segue */ } };

export function iniciarLevantamento(ctx) {
  C = ctx;
  $('#btn-levantamento').addEventListener('click', abrir);
  $('#lev').addEventListener('click', onClique);
}

async function abrir() {
  $('#mapa-bloco').hidden = true;
  $('#lev').hidden = false;
  local = null;
  await recarregar();
  render();
  $('#lev').scrollIntoView({ block: 'start' });
}

function fechar() {
  $('#lev').hidden = true;
  $('#mapa-bloco').hidden = false;
  atualizarEstoqueMapa().catch(() => {});
  if (C.aposMudarEstoque) C.aposMudarEstoque();
}

async function recarregar() {
  const [s, p, l] = await Promise.all([
    C.chamar({ action: 'levantamento_status' }),
    C.chamar({ action: 'produtos_listar' }),
    C.chamar({ action: 'estoque_listar', situacao: 'ATIVO' })
  ]);
  if (!s.ok) throw new Error(s.error);
  status = s;
  produtos = (p.produtos || []).filter(x => x.ativo !== false);
  lotes = (l.lotes || []).filter(x => Number(x.qtd) > 0);
}

function render() {
  if (!status) return;
  const box = $('#lev');
  if (!local) renderGrade(box); else renderLocal(box);
}

// ---------- grade de prateleiras ----------
function renderGrade(box) {
  const por = {};
  status.locais.forEach(l => { por[l.local] = l; });
  const pct = Math.round(status.concluidos / status.total * 100);
  const celula = (cod, rot) => {
    const l = por[cod];
    const rasc = lerRasc(cod).length;
    return `<button type="button" class="lev-cel${l.concluido ? ' ok' : ''}" data-abrir="${cod}" aria-label="${esc(nomeLocal(cod))}: ${l.concluido ? 'conferida' : l.lotes + ' lote(s)'}">
      <b>${rot}</b><span>${l.concluido ? '✓ conferida' : (l.lotes ? l.lotes + ' lote(s)' : 'vazia')}</span>${rasc ? '<em>' + rasc + ' a salvar</em>' : ''}</button>`;
  };
  box.innerHTML = `<div class="painel-bloco">
    <div class="cabecalho-bloco"><h2>Levantamento do estoque</h2><button type="button" class="btn-mini" data-fechar>‹ Voltar ao mapa</button></div>
    <p class="resumo"><b>${status.concluidos} de ${status.total}</b> prateleiras conferidas${status.sem_endereco ? ' · ' + status.sem_endereco + ' lote(s) sem endereço' : ''}</p>
    <div class="lev-barra" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
    <p class="legenda-mapa" style="margin:10px 0">Ande pelas prateleiras: toque no endereço, lance o que está ali e marque como conferida.</p>
    <div class="lev-grade">${[1, 2, 3, 4, 5, 6].map(n => `<div class="lev-est"><h3>Prateleira ${n}</h3>
      ${celula('T' + n, 'Topo')}${['A', 'B', 'C'].map(x => celula('P' + n + '-' + x, 'Nível ' + x)).join('')}</div>`).join('')}</div>
  </div>`;
}

// ---------- um endereço ----------
function renderLocal(box) {
  const l = status.locais.find(x => x.local === local);
  const aqui = lotes.filter(x => (x.local || '').toUpperCase() === local);
  const admin = !!(C.usuario && C.usuario.admin);
  box.innerHTML = `<div class="painel-bloco">
    <div class="cabecalho-bloco"><h2>${esc(local)} <span class="lev-sub">${esc(nomeLocal(local))}</span></h2><button type="button" class="btn-mini" data-grade>‹ Prateleiras</button></div>
    ${l.concluido ? `<p class="resumo"><span class="badge ok">✓ conferida</span> por ${esc(l.concluido_por)} em ${esc(fmtData(l.concluido_em))}${admin ? ' · <button type="button" class="btn-mini" data-reabrir>Reabrir</button>' : ''}</p>` : '<p class="resumo">Ainda não conferida.</p>'}

    <h3 class="lev-h">Já registrado aqui (${aqui.length})</h3>
    <ul class="lista" id="lev-aqui">${aqui.length ? aqui.map(x => `<li><span class="esq"><span class="forte">${esc(x.produto)}</span>
      <span class="fraco">${esc(fmtNum(x.qtd))} ${esc(x.unidade)}${x.validade ? ' · vence ' + esc(fmtData(x.validade)) : ''}</span></span>
      <span class="dir"><button type="button" class="btn-mini" data-recontar="${esc(x.id_lote)}">Contar de novo</button></span></li>`).join('') : '<li class="vazio">Nada registrado neste endereço ainda.</li>'}</ul>

    <h3 class="lev-h">Lançar o que está aqui</h3>
    <form id="lev-form" autocomplete="off" novalidate>
      <label for="lev-prod">Produto</label>
      <input id="lev-prod" type="text" list="lev-prods" placeholder="Digite para buscar ou escreva um produto novo" enterkeyhint="next">
      <datalist id="lev-prods">${produtos.map(p => `<option value="${esc(p.nome)}"></option>`).join('')}</datalist>
      <div id="lev-un-box" class="lev-dica"></div>
      <div class="duas" style="margin-top:8px">
        <div><label for="lev-qtd">Quantidade</label><input id="lev-qtd" type="number" inputmode="decimal" step="any" min="0" placeholder="0"></div>
        <div><label for="lev-val">Validade <span style="text-transform:none;letter-spacing:0;font-weight:400">(opcional)</span></label><input id="lev-val" type="date"></div>
      </div>
      <p class="erro" id="lev-erro" role="alert"></p>
      <button type="submit" class="btn" style="margin-top:6px">+ Adicionar à lista</button>
    </form>

    <h3 class="lev-h">A salvar (${rascunho.length})</h3>
    <ul class="lista" id="lev-rasc">${rascunho.length ? rascunho.map((x, i) => `<li><span class="esq"><span class="forte">${esc(fmtNum(x.qtd))} ${esc(x.unidade)} · ${esc(x.nome)}${x.novo ? ' <span class="badge ambar">produto novo</span>' : ''}</span>
      <span class="fraco">${x.validade ? 'vence ' + esc(fmtData(x.validade)) : 'sem validade'}</span></span>
      <span class="dir"><button type="button" class="btn-mini" data-tirar="${i}" aria-label="Tirar ${esc(x.nome)}">Tirar</button></span></li>`).join('') : '<li class="vazio">Nada na lista ainda.</li>'}</ul>
    <div class="lev-acoes">
      <button type="button" class="btn-mini" data-salvar="0" ${rascunho.length ? '' : 'disabled'}>Salvar itens</button>
      <button type="button" class="btn" data-salvar="1">${rascunho.length ? 'Salvar e marcar como conferida' : 'Marcar como conferida'}</button>
    </div>
  </div>`;
  const form = $('#lev-form');
  form.addEventListener('submit', onAdicionar);
  $('#lev-prod').addEventListener('input', dicaUnidade);
  dicaUnidade();
}

const achar = (nome) => produtos.find(p => p.nome.trim().toLowerCase() === String(nome || '').trim().toLowerCase());

function dicaUnidade() {
  const nome = $('#lev-prod').value.trim();
  const el = $('#lev-un-box');
  if (!nome) { el.innerHTML = ''; return; }
  const p = achar(nome);
  el.innerHTML = p ? 'Unidade: <b>' + esc(p.unidade) + '</b>'
    : 'Produto novo — unidade: <select id="lev-un" aria-label="Unidade do produto novo">' + UNIDADES.map(u => `<option>${u}</option>`).join('') + '</select>';
}

function onAdicionar(e) {
  e.preventDefault();
  const erro = $('#lev-erro');
  erro.classList.remove('visivel');
  const nome = $('#lev-prod').value.trim();
  const qtd = Number($('#lev-qtd').value);
  const falha = (m, foco) => { erro.textContent = m; erro.classList.add('visivel'); $(foco).focus(); };
  if (!nome) return falha('Escolha ou digite o produto.', '#lev-prod');
  if (!(qtd > 0)) return falha('Informe a quantidade (maior que zero).', '#lev-qtd');
  const p = achar(nome);
  rascunho.push({
    produto_id: p ? p.id_produto : '', nome: p ? p.nome : nome, novo: !p, unidade: p ? p.unidade : ($('#lev-un') ? $('#lev-un').value : 'un'),
    qtd, validade: $('#lev-val').value || ''
  });
  gravarRasc();
  renderLocal($('#lev'));
  $('#lev-prod').focus(); // próximo item: o teclado já volta no produto
}

async function salvar(concluir) {
  const botoes = document.querySelectorAll('#lev [data-salvar]');
  botoes.forEach(b => { b.disabled = true; });
  try {
    const r = await C.chamar({
      action: 'levantamento_salvar', local, concluir,
      itens_json: JSON.stringify(rascunho.map(x => ({ produto_id: x.produto_id, produto_novo_nome: x.produto_id ? '' : x.nome, unidade: x.novo ? x.unidade : '', qtd: x.qtd, validade: x.validade })))
    });
    if (!r.ok) { await avisar({ titulo: 'Não deu para salvar', texto: r.error + '\nNada foi gravado — corrija e tente de novo.', icone: 'perigo' }); return; }
    const n = r.lotes_criados;
    rascunho = []; gravarRasc();
    C.toast(concluir ? local + ' conferida' + (n ? ' · ' + n + ' item(ns) salvo(s)' : '') : n + ' item(ns) salvo(s) em ' + local, 'ok');
    await recarregar();
    if (concluir) { local = null; }
    render();
    if (concluir) $('#lev').scrollIntoView({ block: 'start' });
  } catch (err) {
    C.toast(err.message, 'erro');
  } finally {
    botoes.forEach(b => { b.disabled = false; });
  }
}

async function recontar(id) {
  const x = lotes.find(l => l.id_lote === id);
  if (!x) return;
  const v = await perguntar({ titulo: 'Contar de novo: ' + x.produto, rotulo: 'Quantidade que você contou (' + x.unidade + ')', valor: String(x.qtd), confirmar: 'Acertar' });
  if (v === null) return;
  const n = Number(String(v).replace(',', '.'));
  if (!(n >= 0) || String(v).trim() === '') { C.toast('Informe um número (0 ou mais)', 'erro'); return; }
  if (n === 0 && !(await confirmar({ titulo: 'Zerar este lote?', texto: x.produto + ' sai do estoque deste endereço (fica registrado como ajuste).', confirmar: 'Zerar', perigo: true }))) return;
  const r = await C.chamar({ action: 'estoque_corrigir', id_lote: id, qtd_nova: n, observacao: 'recontagem no levantamento' });
  if (!r.ok) { C.toast(r.error, 'erro'); return; }
  C.toast(r.sem_mudanca ? 'Quantidade já estava certa' : x.produto + ': ' + r.antes + ' → ' + r.depois, 'ok');
  await recarregar();
  render();
}

async function onClique(e) {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.fechar !== undefined) return fechar();
    if (b.dataset.abrir) { local = b.dataset.abrir; rascunho = lerRasc(local); render(); return $('#lev').scrollIntoView({ block: 'start' }); }
    if (b.dataset.grade !== undefined) { local = null; render(); return; }
    if (b.dataset.tirar !== undefined) { rascunho.splice(Number(b.dataset.tirar), 1); gravarRasc(); return renderLocal($('#lev')); }
    if (b.dataset.salvar !== undefined) return await salvar(b.dataset.salvar === '1');
    if (b.dataset.recontar) return await recontar(b.dataset.recontar);
    if (b.dataset.reabrir !== undefined) {
      const r = await C.chamar({ action: 'levantamento_reabrir', local });
      if (!r.ok) throw new Error(r.error);
      C.toast('Conferência reaberta');
      await recarregar(); render();
    }
  } catch (err) { C.toast(err.message, 'erro'); }
}
