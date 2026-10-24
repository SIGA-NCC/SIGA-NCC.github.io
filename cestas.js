// cestas.js — aba Cestas em 4 partes: Montar/entregar · Prontas no estoque · Receita (admin edita) · Histórico.
// Montagem personalizável: parte da receita, mas dá para mudar quantidades, tirar e pôr itens.
// Saída pode ser cesta (entregar agora ou guardar embalada) ou itens avulsos. Baixa FIFO tudo-ou-nada no backend.

import { esc, fmtNum, fmtDataHora } from './ui.js';
import { cascata, esqueleto, vazioComVerso } from './fx.js';
import { confirmar, avisar, perguntar, abrirDialogo, fecharDialogo } from './sigma-dialogo.js';
import { listarRecebedores, escolherRecebedor, acharRecebedor, chamarEntrega } from './recebedores.js';

let C = null;          // contexto injetado pelo index.html
let itens = [];        // receita atual (cesta_listar)
let produtos = [];     // catálogo (para adicionar item)
let capac = 0;         // cestas possíveis hoje (kpis)
const $ = (s) => document.querySelector(s);
let saldoAtual = {};     // produto_id → { disponivel, cestas_cabem } (kpis) — usado pela receita
let saldoProd = {};      // produto_id → quantidade ativa em estoque (todos os produtos)
let montagem = [];       // [{ produto_id, nome, qtd, unidade }] — o que vai sair agora
let mexeu = false;       // a pessoa editou a montagem → não sobrescrever quando a receita recarregar
let confirmando = false; // 1º toque pede confirmação: a baixa no estoque não tem desfazer
let timerConfirma = null;
let destacar = false;    // a próxima renderização marca a cesta recém-montada
const reduz = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3 5 8.8 9.6 3.4"/></svg>';
const modo = () => (document.querySelector('input[name=c-modo]:checked') || {}).value || 'CESTA';
const destino = () => (document.querySelector('input[name=c-destino]:checked') || {}).value || 'ENTREGUE';
const nomeLocal = (l) => (l === 'ARMAZEM' ? 'dentro do armazém' : l);
const nomeProd = (id) => (produtos.find(p => p.id_produto === id) || {}).nome || id;

export function iniciarCestas(ctx) {
  C = ctx;
  esqueleto($('#cesta-itens'), 4);
  $('#btn-cancelar-cesta').addEventListener('click', cancelarConfirmacao);
  $('#form-cesta').addEventListener('input', cancelarConfirmacao);
  $('#btn-atualizar-cestas').addEventListener('click', () => atualizarCestas().catch(e => C.toast(e.message, 'erro')));
  $('#btn-atualizar-prontas').addEventListener('click', () => renderProntas().catch(e => C.toast(e.message, 'erro')));
  $('#btn-cesta-editar').addEventListener('click', alternarEdicao);
  $('#form-cesta').addEventListener('submit', onMontar);
  $('#c-destinatario').addEventListener('input', dicaRecebedor);
  $('#c-btn-rec').addEventListener('click', async () => {
    const r = await escolherRecebedor(C, { titulo: 'Quem recebe a cesta?', busca: $('#c-destinatario').value.trim() });
    if (r) { $('#c-destinatario').value = r.nome_completo; cancelarConfirmacao(); dicaRecebedor(); }
  });
  $('#form-cesta-add').addEventListener('submit', onAdicionarItem);

  // partes da aba
  $('#cestas-sub').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sub]');
    if (b) mostrarParte(b.dataset.sub);
  });
  // modo (cesta × avulso) e destino (entregar × embalada)
  document.querySelectorAll('input[name=c-modo], input[name=c-destino]').forEach(r => r.addEventListener('change', () => {
    if (r.name === 'c-modo') { montagem = modo() === 'CESTA' ? daReceita() : []; mexeu = modo() === 'AVULSO'; }
    aplicarModo();
    renderMontagem();
  }));
  // montagem editável
  $('#cesta-conferencia').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-op]');
    if (!b) return;
    const i = Number(b.closest('li').dataset.i);
    if (b.dataset.op === 'tirar') montagem.splice(i, 1);
    else {
      const passo = Number(b.dataset.op);
      montagem[i].qtd = Math.max(0, Math.round((Number(montagem[i].qtd) + passo) * 100) / 100);
      if (!montagem[i].qtd) montagem.splice(i, 1);
    }
    mexeu = true;
    cancelarConfirmacao();
    renderMontagem();
  });
  $('#cesta-conferencia').addEventListener('change', (e) => {
    const inp = e.target.closest('input[data-qtd]');
    if (!inp) return;
    const i = Number(inp.closest('li').dataset.i);
    montagem[i].qtd = Math.max(0, Number(inp.value) || 0);
    if (!montagem[i].qtd) montagem.splice(i, 1);
    mexeu = true;
    renderMontagem();
  });
  $('#c-add-btn').addEventListener('click', () => {
    const id = $('#c-add-produto').value;
    if (!id) { $('#c-add-produto').focus(); return; }
    const p = produtos.find(x => x.id_produto === id);
    const ja = montagem.find(m => m.produto_id === id);
    if (ja) ja.qtd = Number(ja.qtd) + 1;
    else montagem.push({ produto_id: id, nome: p.nome, qtd: 1, unidade: p.unidade });
    $('#c-add-produto').value = '';
    mexeu = true;
    cancelarConfirmacao();
    renderMontagem();
  });
  $('#c-voltar-receita').addEventListener('click', () => { montagem = daReceita(); mexeu = false; renderMontagem(); });
  $('#cestas-prontas').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-entregar]');
    if (b) entregarPronta(b.dataset.entregar);
  });

  // edição inline da receita (delegação)
  $('#cesta-itens').addEventListener('click', onAcaoItem);
  $('#ce-produto').addEventListener('change', () => {
    const p = produtos.find(x => x.id_produto === $('#ce-produto').value);
    $('#ce-unidade').value = p ? p.unidade : '';
  });
  popularLocais();
  aplicarModo();
}

// Prateleiras (6 × 3 níveis), topo e "dentro do armazém" (cesta que fica fora das prateleiras).
function popularLocais() {
  const g = (rot, vals) => `<optgroup label="${rot}">` + vals.map(v => `<option value="${v}">${nomeLocal(v)}</option>`).join('') + '</optgroup>';
  const prat = [], topo = [];
  for (let n = 1; n <= 6; n++) { ['A', 'B', 'C'].forEach(l => prat.push('P' + n + '-' + l)); topo.push('T' + n); }
  $('#c-local').innerHTML = '<option value="">— não informar —</option>' +
    g('Dentro do armazém', ['ARMAZEM']) + g('Prateleiras', prat) + g('Topo das prateleiras', topo);
}

// Antes de dar baixa numa doação: se há cesta pronta no estoque, pergunta se a doação saiu de uma delas.
// Devolve { entregue: true, r } se entregou uma pronta, ou null para seguir o fluxo normal.
async function perguntarProntas(destinatario, rec) {
  const l = await C.chamar({ action: 'cestas_listar', status: 'EMBALADA' }).catch(() => null);
  const cs = (l && l.ok && l.cestas) || [];
  if (!cs.length) return null;
  return new Promise((resolve) => {
    let feito = false;
    abrirDialogo({
      titulo: 'Doação de cesta pronta?',
      subtitulo: 'Há ' + cs.length + ' cesta(s) pronta(s) no estoque. A doação para ' + destinatario + ' saiu de uma delas?',
      abas: [{ id: 'l', rotulo: '', render: (el) => {
        el.innerHTML = cs.map(c => `<button type="button" class="btn" data-id="${esc(c.id_cesta)}" style="display:block;width:100%;margin-bottom:10px;text-align:left">
          Sim, foi esta: cesta ${c.personalizada ? 'personalizada' : 'padrão'} · ${esc(fmtNum(c.qtd_itens))} itens
          <br><small>${c.local ? 'estava ' + (c.local === 'ARMAZEM' ? 'dentro do armazém' : 'em ' + esc(c.local)) : 'local não informado'} · montada ${esc(fmtDataHora(c.timestamp))}</small></button>`).join('');
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button[data-id]');
          if (!b || feito) return;
          feito = true;
          b.disabled = true;
          const r = await chamarEntrega(C, { action: 'cesta_entregar', id_cesta: b.dataset.id, destinatario, recebedor_id: rec ? rec.id_recebedor : '' });
          fecharDialogo();
          resolve({ r });
        });
      } }],
      acoes: [{ rotulo: 'Não, foi do estoque solto', estilo: '' }],
      aoFechar: () => { if (!feito) resolve(null); }
    });
  });
}

function mostrarParte(sub) {
  document.querySelectorAll('#cestas-sub [data-sub]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sub === sub)));
  document.querySelectorAll('#aba-cestas > .painel-bloco[data-sub]').forEach(bl => {
    const ver = bl.dataset.sub === sub;
    bl.hidden = !ver;
    if (ver) { bl.classList.remove('aba-entra'); void bl.offsetWidth; bl.classList.add('aba-entra'); }
  });
  if (sub === 'prontas') renderProntas().catch(e => C.toast(e.message, 'erro'));
}

function aplicarModo() {
  const avulso = modo() === 'AVULSO';
  const embalada = !avulso && destino() === 'EMBALADA';
  $('#c-destino-box').hidden = avulso;
  $('#c-local-box').hidden = !embalada;
  $('#c-dest-box').hidden = embalada;
  $('#c-modo-dica').textContent = avulso
    ? 'Itens soltos para uma família (sem cesta). Adicione o que vai sair.'
    : (embalada ? 'A cesta fica pronta no estoque e aparece em “Prontas no estoque” para entregar depois.' : 'Parte da receita padrão; ajuste as quantidades se precisar.');
  $('#btn-montar-cesta').textContent = rotuloBotao();
}

function rotuloBotao() {
  if (modo() === 'AVULSO') return 'Entregar itens e dar baixa';
  return destino() === 'EMBALADA' ? 'Montar e guardar no estoque' : 'Montar cesta e dar baixa';
}

const daReceita = () => itens.filter(i => i.ativo !== false)
  .map(i => ({ produto_id: i.produto_id, nome: i.nome, qtd: Number(i.qtd), unidade: i.unidade }));

// A montagem é igual à receita? (senão vai como personalizada)
function ehReceita() {
  const r = daReceita();
  if (r.length !== montagem.length) return false;
  return r.every(x => montagem.some(m => m.produto_id === x.produto_id && Number(m.qtd) === Number(x.qtd)));
}

export async function atualizarCestas() {
  if (!C) return;
  const [rc, rk, re, rp] = await Promise.all([
    C.chamar({ action: 'cesta_listar' }),
    C.chamar({ action: 'kpis' }),
    C.chamar({ action: 'estoque_listar', situacao: 'ATIVO' }),
    produtos.length ? Promise.resolve({ ok: true, produtos }) : C.chamar({ action: 'produtos_listar' })
  ]);
  if (!rc.ok) throw new Error(rc.error);

  itens = rc.itens || [];
  if (rp.ok) produtos = rp.produtos || [];
  const saldo = {};
  if (rk.ok) {
    capac = rk.cestas_possiveis;
    (rk.saldo || []).forEach(s => { saldo[s.produto_id] = s; });
  }
  saldoProd = {};
  if (re.ok) (re.lotes || []).forEach(l => { saldoProd[l.produto_id] = (saldoProd[l.produto_id] || 0) + (Number(l.qtd) || 0); });

  $('#btn-cesta-editar').hidden = !(C.usuario && C.usuario.admin);
  if (!C.usuario || !C.usuario.admin) $('#cesta-edicao').hidden = true;

  saldoAtual = saldo;
  if (!confirmando && modo() === 'CESTA' && !mexeu) montagem = daReceita();
  $('#c-add-produto').innerHTML = '<option value="">— escolha o produto —</option>' +
    produtos.filter(p => p.ativo !== false).map(p => `<option value="${esc(p.id_produto)}">${esc(p.nome)} (${fmtNum(saldoProd[p.id_produto] || 0)} ${esc(p.unidade)} em estoque)</option>`).join('');
  renderReceita(saldo);
  renderResumo(saldo);
  renderMontagem();
  await renderRecentes();
  renderProntas().catch(() => {});
  await prepararEdicao();
}

function renderMontagem() {
  const ul = $('#cesta-conferencia');
  const personalizada = modo() === 'CESTA' && !ehReceita();
  $('#c-personalizada').textContent = personalizada ? '· personalizada' : (modo() === 'CESTA' ? '· receita padrão' : '');
  $('#c-voltar-receita').hidden = !personalizada;
  $('#btn-montar-cesta').textContent = rotuloBotao();
  if (!montagem.length) {
    ul.innerHTML = '<li class="vazio">' + (modo() === 'AVULSO' ? 'Nenhum item ainda. Use “Adicionar item” abaixo.' : 'Cesta vazia. Volte à receita ou adicione itens.') + '</li>';
    travar(modo() === 'AVULSO' ? 'Adicione pelo menos um item.' : 'Adicione itens para montar.');
    return;
  }
  const faltam = [];
  ul.innerHTML = montagem.map((it, i) => {
    const tem = saldoProd[it.produto_id] || 0;
    const falta = tem < it.qtd;
    if (falta) faltam.push(it.nome);
    return `<li class="${falta ? 'falta' : 'ok'}" data-i="${i}" style="--i:${i}">
      <span class="marca" ${falta ? '' : 'style="background:var(--verde-2);border-color:var(--verde-2)"'}>${falta ? '' : CHECK.replace('<svg', '<svg style="stroke-dasharray:none;stroke-dashoffset:0"')}</span>
      <span class="info-item"><span class="nome">${esc(it.nome)}</span>
        <span class="saldo-item">${falta ? 'tem só ' + fmtNum(tem) + ' ' + esc(it.unidade) : fmtNum(tem) + ' ' + esc(it.unidade) + ' em estoque'}</span></span>
      <span class="passo-mini">
        <button type="button" data-op="-1" aria-label="Menos ${esc(it.nome)}">−</button>
        <input type="number" min="0" step="any" value="${it.qtd}" data-qtd aria-label="Quantidade de ${esc(it.nome)}" inputmode="decimal">
        <button type="button" data-op="1" aria-label="Mais ${esc(it.nome)}">+</button>
        <span class="qtd">${esc(it.unidade)}</span>
      </span>
      <button type="button" class="tirar" data-op="tirar" aria-label="Tirar ${esc(it.nome)}">×</button>
    </li>`;
  }).join('');
  travar(faltam.length ? 'Falta no estoque: ' + faltam.join(', ') + '. Diminua a quantidade, tire o item ou registre a doação na aba Receber.' : '');
}

function travar(msg) {
  const btn = $('#btn-montar-cesta');
  const caixa = $('#cesta-bloqueio');
  caixa.hidden = !msg;
  caixa.textContent = msg || '';
  btn.disabled = !!msg;
  btn.classList.toggle('travado', !!msg);
}

function cancelarConfirmacao() {
  if (!confirmando) return;
  confirmando = false;
  clearTimeout(timerConfirma);
  const btn = $('#btn-montar-cesta');
  btn.classList.remove('confirma');
  btn.textContent = rotuloBotao();
  $('#btn-cancelar-cesta').hidden = true;
}

function dicaRecebedor() {
  const nome = $('#c-destinatario').value.trim();
  const dica = $('#c-rec-dica');
  if (!nome) { dica.textContent = ''; return; }
  dica.textContent = acharRecebedor(nome) ? '✓ recebedor cadastrado — o app avisa se já recebeu neste mês' : 'sem cadastro: vai só pelo nome (cadastre para controlar a cada mês)';
}

async function onMontar(e) {
  e.preventDefault();
  const erro = $('#erro-cesta');
  erro.classList.remove('visivel');
  const btn = $('#btn-montar-cesta');
  const destinatario = $('#c-destinatario').value.trim();
  const avulso = modo() === 'AVULSO';
  const embalada = !avulso && destino() === 'EMBALADA';
  if (!embalada && !destinatario) {
    erro.textContent = 'Informe a família ou pessoa que recebe.';
    erro.classList.add('visivel');
    $('#c-destinatario').focus();
    return;
  }

  // liga ao cadastro: nome digitado igual a um recebedor cadastrado vira o vínculo (sem clique extra)
  const rec = !embalada ? acharRecebedor(destinatario) : null;

  // doação com cesta pronta no estoque: pergunta qual saiu (a baixa já foi dada ao embalar)
  if (!confirmando && !embalada) {
    const pr = await perguntarProntas(destinatario, rec);
    if (pr) {
      if (pr.r.cancelado) { C.toast(pr.r.error); return; }
      if (!pr.r.ok) { await avisar({ titulo: 'Não deu para entregar', texto: pr.r.error, icone: 'perigo' }); return; }
      destacar = true;
      C.celebrar({ titulo: 'Cesta pronta entregue!', detalhe: 'Para ' + pr.r.destinatario, tema: 'servir' });
      $('#c-destinatario').value = ''; dicaRecebedor();
      await renderRecentes(); await atualizarCestas(); await C.recarregarPainel().catch(() => {});
      return;
    }
  }

  // 1º toque: pede confirmação (a baixa no estoque não tem desfazer)
  if (!confirmando) {
    confirmando = true;
    btn.classList.add('confirma');
    btn.textContent = embalada ? 'Confirmar: guardar cesta embalada' : 'Confirmar: ' + (avulso ? 'itens' : 'cesta') + ' para ' + destinatario;
    $('#btn-cancelar-cesta').hidden = false;
    timerConfirma = setTimeout(cancelarConfirmacao, 8000);
    return;
  }
  cancelarConfirmacao();

  btn.disabled = true; btn.textContent = 'Registrando…';
  const conf = $('#cesta-conferencia');
  const lista = JSON.stringify(montagem.map(m => ({ produto_id: m.produto_id, qtd: m.qtd, unidade: m.unidade })));
  try {
    const chamada = avulso
      ? C.chamar({ action: 'entrega_avulsa', destinatario, recebedor_id: rec ? rec.id_recebedor : '', itens_json: lista, observacao: $('#c-observacao').value.trim() })
      : chamarEntrega(C, {
          action: 'cesta_montar', destinatario: embalada ? '' : destinatario, recebedor_id: rec ? rec.id_recebedor : '',
          destino: embalada ? 'EMBALADA' : 'ENTREGUE', local: embalada ? $('#c-local').value : '',
          itens_json: ehReceita() ? '' : lista, observacao: $('#c-observacao').value.trim()
        });
    if (!reduz()) {
      conf.querySelectorAll('li.ok .marca').forEach(m => { m.removeAttribute('style'); });
      conf.querySelectorAll('li.ok .marca svg').forEach(v => { v.removeAttribute('style'); });
      void conf.offsetWidth;
      conf.classList.add('baixando');
    }
    const n = conf.querySelectorAll('li.ok').length;
    const [r] = await Promise.all([chamada, reduz() ? 0 : esperar(Math.min(1400, 450 + n * 110))]);
    if (!r.ok) throw new Error(r.error);
    destacar = true;
    if (avulso) C.celebrar({ titulo: 'Entrega registrada!', detalhe: r.qtd_itens + ' item(ns) para ' + r.destinatario, tema: 'dar' });
    else if (embalada) C.celebrar({ titulo: 'Cesta guardada!', detalhe: 'Pronta no estoque' + ($('#c-local').value ? ' em ' + nomeLocal($('#c-local').value) : '') + ' · ' + r.qtd_itens + ' itens', tema: 'servir' });
    else C.celebrar({ titulo: 'Cesta entregue!', detalhe: 'Para ' + r.destinatario + ' · ' + r.qtd_itens + ' itens' + (r.personalizada ? ' (personalizada)' : ''), tema: 'servir' });
    $('#c-destinatario').value = '';
    dicaRecebedor();
    $('#c-observacao').value = '';
    montagem = avulso ? [] : daReceita();
    mexeu = avulso;
    await atualizarCestas();
    await C.recarregarPainel();
  } catch (err) {
    conf.classList.remove('baixando');
    erro.textContent = err.message;
    erro.classList.add('visivel');
    await atualizarCestas().catch(() => {}); // o saldo pode ter mudado (alguém montou antes)
  } finally {
    btn.disabled = false;
    renderMontagem();
  }
}

async function renderProntas() {
  const r = await C.chamar({ action: 'cestas_listar', status: 'EMBALADA' });
  const ul = $('#cestas-prontas');
  if (!r.ok) { ul.innerHTML = `<li class="vazio">${esc(r.error)}</li>`; return; }
  const cs = r.cestas || [];
  $('#cestas-prontas-n').textContent = cs.length ? '(' + cs.length + ')' : '';
  if (!cs.length) {
    ul.innerHTML = vazioComVerso('Nenhuma cesta embalada esperando.', 'servir');
    return;
  }
  ul.innerHTML = cs.map(c => `<li class="pronta">
    <span class="esq"><span class="forte">Cesta ${c.personalizada ? 'personalizada' : 'padrão'} · ${esc(fmtNum(c.qtd_itens))} itens</span>
      <span class="fraco">montada ${esc(fmtDataHora(c.timestamp))} por ${esc(c.montada_por || '—')}${c.local ? ' · guardada ' + (c.local === 'ARMAZEM' ? '<b>dentro do armazém</b>' : 'em <b>' + esc(c.local) + '</b>') : ''}</span></span>
    <span class="dir"><button type="button" class="btn-mini" data-entregar="${esc(c.id_cesta)}">Entregar</button></span>
  </li>`).join('');
  cascata(ul);
}

async function entregarPronta(id) {
  const esc0 = await escolherRecebedor(C, { titulo: 'Entregar cesta embalada — quem recebe?' });
  if (!esc0) return;
  const r = await chamarEntrega(C, { action: 'cesta_entregar', id_cesta: id, recebedor_id: esc0.id_recebedor });
  if (r.cancelado) { C.toast(r.error); return; }
  if (!r.ok) { await avisar({ titulo: 'Não deu para entregar', texto: r.error, icone: 'perigo' }); return; }
  destacar = true;
  C.celebrar({ titulo: 'Cesta entregue!', detalhe: 'Para ' + r.destinatario, tema: 'servir' });
  await renderProntas();
  await renderRecentes();
  C.recarregarPainel().catch(() => {});
}

async function renderRecentes() {
  const r = await C.chamar({ action: 'cestas_listar', limite: 15 });
  const tb = document.querySelector('#cesta-recentes');
  if (!r.ok) { tb.innerHTML = `<tr><td colspan="4" class="vazio">${esc(r.error)}</td></tr>`; return; }
  if (!r.cestas.length) {
    tb.innerHTML = '<tr><td colspan="4" class="vazio">Nenhuma cesta montada ainda — a primeira será uma bênção.</td></tr>';
    return;
  }
  const cad = await listarRecebedores(true).catch(() => []);
  $('#c-destinatarios').innerHTML = [...new Set([...cad.filter(x => x.ativo).map(x => x.nome_completo), ...r.cestas.map(c => c.destinatario).filter(Boolean)])]
    .map(d => `<option value="${esc(d)}"></option>`).join('');
  tb.innerHTML = r.cestas.map((c, i) => `<tr${destacar && i === 0 ? ' class="novo"' : ''}>
    <td data-c="info">${esc(fmtDataHora(c.timestamp))}</td>
    <td data-c="quem">${c.status === 'EMBALADA'
      ? '<span class="badge ambar">embalada no estoque</span>'
      : '<strong>' + esc(c.destinatario) + '</strong>'}${c.personalizada ? ' <span class="badge">personalizada</span>' : ''}${c.observacao ? '<br><span style="font-size:.78rem;color:var(--tinta-fraca)">' + esc(c.observacao) + '</span>' : ''}</td>
    <td data-c="itens">${esc(fmtNum(c.qtd_itens))} itens</td>
    <td data-c="info">${esc(c.montada_por || '—')}</td>
  </tr>`).join('');
  destacar = false;
}

function renderReceita(saldo) {
  const ul = document.querySelector('#cesta-itens');
  const admin = !!(C.usuario && C.usuario.admin);
  if (!itens.length) {
    ul.innerHTML = '<li class="vazio">Cesta padrão vazia. ' +
      (admin ? 'Use “Editar receita” para adicionar itens.' : 'Peça ao administrador para cadastrar.') + '</li>';
    return;
  }
  ul.innerHTML = itens.map(it => {
    const s = saldo[it.produto_id] || {};
    const disp = s.disponivel != null ? fmtNum(s.disponivel) + ' ' + it.unidade : '—';
    const ok = s.cestas_cabem >= 1;
    const inativa = it.ativo === false;
    const cabe = s.cestas_cabem != null ? s.cestas_cabem : it.cestas_cabem;
    const maxCabe = Math.max(1, ...itens.filter(i => i.ativo !== false).map(i => (saldo[i.produto_id] || {}).cestas_cabem || i.cestas_cabem || 0));
    const gargalo = !inativa && cabe === capac && capac < Number.MAX_SAFE_INTEGER;
    const barra = inativa ? '' : `<span class="barra ${cabe < 1 ? 'zero' : (gargalo ? 'gargalo' : '')}" role="img" aria-label="${cabe} cesta(s) cabem"><i style="--p:${Math.min(1, cabe / maxCabe)}"></i></span>`;
    const corpo = admin
      ? `<span class="dir">
          <input class="mini-inp" type="number" step="any" min="0.01" value="${esc(it.qtd)}" data-campo="qtd" aria-label="Quantidade">
          <input class="mini-inp" type="text" value="${esc(it.unidade)}" data-campo="unidade" aria-label="Unidade">
          <button class="btn-mini" data-acao="salvar" type="button">Salvar</button>
          <button class="btn-mini" data-acao="${it.ativo === false ? 'reativar' : 'desativar'}" type="button">${it.ativo === false ? 'Reativar' : 'Remover'}</button>
        </span>`
      : `<span class="badge ${inativa ? '' : (ok ? 'ok' : 'riso')}">${inativa ? 'fora da receita' : disp + ' em estoque'}</span>`;
    return `<li data-id="${esc(it.id_item)}" ${inativa ? 'style="opacity:.5"' : ''}>
      <span class="esq"><span class="forte">${esc(it.nome)}</span>
      <span class="fraco">${inativa ? '' : 'usa ' + fmtNum(it.qtd) + ' ' + esc(it.unidade) + ' · ' + cabe + ' cesta(s)'}${gargalo ? ' · <span class="gargalo-tag">limita a cesta</span>' : ''}</span>${barra}</span>
      ${corpo}
    </li>`;
  }).join('');
  ul.removeAttribute('aria-busy');
  cascata(ul);
}

function renderResumo(saldo) {
  const el = document.querySelector('#cesta-resumo');
  const ativos = itens.filter(i => i.ativo !== false);
  if (!ativos.length) {
    el.innerHTML = '<span class="badge ambar">Nenhum item na receita</span>';
    return;
  }
  const gargalos = ativos.filter(i => i.cestas_cabem === capac && capac < Number.MAX_SAFE_INTEGER)
    .map(i => i.nome);
  const unicos = [...new Set(gargalos)];
  el.innerHTML =
    `<span class="badge ok">${capac} cesta(s) possíveis hoje</span> ` +
    (capac > 0
      ? (unicos.length ? `<span class="fraco">limitando: ${esc(unicos.join(', '))}</span>` : '')
      : '<span class="badge riso">estoque insuficiente</span>');
}

async function prepararEdicao() {
  if (!(C.usuario && C.usuario.admin)) return;
  if (!produtos.length) {
    const r = await C.chamar({ action: 'produtos_listar' });
    if (r.ok) produtos = r.produtos || [];
  }
  const naCesta = new Set(itens.filter(i => i.ativo !== false).map(i => i.produto_id));
  const livres = produtos.filter(p => p.ativo && !naCesta.has(p.id_produto));
  const sel = document.querySelector('#ce-produto');
  sel.innerHTML = '<option value="">— escolha o produto —</option>' +
    livres.map(p => `<option value="${esc(p.id_produto)}">${esc(p.nome)} (${esc(p.unidade)})</option>`).join('');
}

function alternarEdicao() {
  const box = document.querySelector('#cesta-edicao');
  box.hidden = !box.hidden;
  document.querySelector('#btn-cesta-editar').textContent = box.hidden ? 'Editar receita' : 'Fechar edição';
}

async function onAdicionarItem(e) {
  e.preventDefault();
  const erro = document.querySelector('#erro-cesta-edicao');
  erro.classList.remove('visivel');
  try {
    const r = await C.chamar({
      action: 'cesta_editar', operacao: 'adicionar',
      produto_id: document.querySelector('#ce-produto').value,
      qtd: document.querySelector('#ce-qtd').value,
      unidade: document.querySelector('#ce-unidade').value.trim()
    });
    if (!r.ok) throw new Error(r.error);
    C.toast('Item adicionado à cesta', 'ok');
    document.querySelector('#ce-qtd').value = '';
    await atualizarCestas();
    await C.recarregarPainel();
  } catch (err) {
    erro.textContent = err.message;
    erro.classList.add('visivel');
  }
}

async function onAcaoItem(e) {
  const btn = e.target.closest('button[data-acao]');
  if (!btn) return;
  const li = btn.closest('li[data-id]');
  const id_item = li.dataset.id;
  const acao = btn.dataset.acao;

  if (acao === 'desativar' && !(await confirmar({ titulo: 'Remover da receita', perigo: true, confirmar: 'Remover',
    texto: 'Remover este item da cesta padrão?\nO estoque não muda; só deixa de entrar nas próximas cestas.' }))) return;

  const payload = { action: 'cesta_editar', id_item, operacao: acao };
  if (acao === 'salvar') {
    payload.operacao = 'editar';
    payload.qtd = li.querySelector('[data-campo="qtd"]').value;
    payload.unidade = li.querySelector('[data-campo="unidade"]').value.trim();
  }
  btn.disabled = true;
  try {
    const r = await C.chamar(payload);
    if (!r.ok) throw new Error(r.error);
    C.toast('Receita atualizada', 'ok');
    await atualizarCestas();
    await C.recarregarPainel();
  } catch (err) {
    C.toast(err.message, 'erro');
    btn.disabled = false;
  }
}

