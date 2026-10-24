// recebedores.js — aba Recebedores (quem recebe a cesta) + utilitários usados pela aba Cestas.
// Só o nome completo é obrigatório. Entrega repetida no mês: avisa, pede confirmação (e motivo opcional);
// não bloqueia — o ADM recebe o alerta pelo painel.

import { esc, fmtData, fmtDataHora } from './ui.js';
import { vazioComVerso, cascata, esqueleto } from './fx.js';
import { abrirDialogo, fecharDialogo, confirmar, avisar, perguntar } from './sigma-dialogo.js';

let C = null;
let todos = [];            // última lista (recebedor_listar)
let filtro = 'todos';      // todos | mes | nao
const $ = (s) => document.querySelector(s);

export const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function iniciarRecebedores(ctx) {
  C = ctx;
  $('#rec-busca').addEventListener('input', renderLista);
  $('#btn-atualizar-rec').addEventListener('click', () => atualizarRecebedores().catch(e => C.toast(e.message, 'erro')));
  $('#btn-novo-rec').addEventListener('click', async () => {
    const r = await formRecebedor(C, { nome_completo: $('#rec-busca').value.trim() });
    if (r) { $('#rec-busca').value = ''; await atualizarRecebedores(); abrirFicha(r.id_recebedor); }
  });
  $('#rec-chips').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    filtro = b.dataset.f;
    $('#rec-chips').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    renderLista();
  });
  $('#rec-lista').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) abrirFicha(li.dataset.id);
  });
  $('#rec-lista').addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirFicha(li.dataset.id); }
  });
}

export async function listarRecebedores(forcar = false) {
  if (todos.length && !forcar) return todos;
  const r = await C.chamar({ action: 'recebedor_listar', incluir_inativos: !!(C.usuario && C.usuario.admin) });
  if (!r.ok) throw new Error(r.error);
  todos = r.recebedores;
  return todos;
}

export async function atualizarRecebedores() {
  esqueleto($('#rec-lista'), 4);
  await listarRecebedores(true);
  renderLista();
}

function renderLista() {
  const q = semAcento($('#rec-busca').value);
  const lista = todos.filter(r => {
    if (q && !semAcento(r.nome_completo + ' ' + r.telefone + ' ' + r.endereco).includes(q)) return false;
    if (filtro === 'mes') return r.ativo && r.recebeu_mes;
    if (filtro === 'nao') return r.ativo && !r.recebeu_mes;
    if (filtro === 'inativos') return !r.ativo;
    return r.ativo;
  });
  const ativos = todos.filter(r => r.ativo);
  $('#rec-resumo').textContent = ativos.length + ' cadastrado(s) · ' + ativos.filter(r => r.recebeu_mes).length + ' já receberam cesta neste mês';
  const ul = $('#rec-lista');
  if (!lista.length) {
    ul.innerHTML = todos.length
      ? '<li class="vazio">Ninguém encontrado com esse filtro.</li>'
      : vazioComVerso('Nenhum recebedor cadastrado ainda. Toque em “Novo recebedor”.', 'servir');
    return;
  }
  ul.innerHTML = lista.map(r => `<li data-id="${esc(r.id_recebedor)}" tabindex="0" style="cursor:pointer">
    <span class="esq"><span class="forte">${esc(r.nome_completo)}${r.ativo ? '' : ' <span class="badge">inativo</span>'}</span>
      <span class="fraco">${[r.telefone, r.endereco].filter(Boolean).map(esc).join(' · ') || 'sem telefone/endereço'}${r.ultima_cesta ? ' · última cesta ' + esc(fmtData(r.ultima_cesta)) : ''}</span></span>
    <span class="dir">${r.recebeu_mes ? '<span class="badge ambar">recebeu este mês</span>' : '<span class="badge ok">pode receber</span>'}</span>
  </li>`).join('');
  cascata(ul);
}

async function abrirFicha(id) {
  const r = await C.chamar({ action: 'recebedor_historico', id_recebedor: id });
  if (!r.ok) { C.toast(r.error, 'erro'); return; }
  const rec = r.recebedor;
  const admin = !!(C.usuario && C.usuario.admin);
  const linha = (rot, v) => `<div class="sg-par"><dt>${rot}</dt><dd>${v ? esc(v) : '<span class="sg-vazio">—</span>'}</dd></div>`;
  abrirDialogo({
    titulo: rec.nome_completo,
    subtitulo: rec.recebeu_mes ? 'Já recebeu cesta neste mês' : 'Ainda não recebeu neste mês',
    abas: [
      { id: 'dados', rotulo: 'Dados', render: (el) => {
        el.innerHTML = `<dl class="sg-grade">${linha('Telefone', rec.telefone)}${linha('E-mail', rec.email)}${linha('Endereço', rec.endereco)}${linha('Observação', rec.observacao)}
          ${linha('Cestas recebidas', String(rec.total_cestas))}${linha('Cadastrado', rec.criado_em ? fmtData(rec.criado_em) + (rec.criado_por ? ' por ' + rec.criado_por : '') : '')}</dl>`;
      } },
      { id: 'hist', rotulo: 'Histórico (' + r.entregas.length + ')', render: (el) => {
        if (!r.entregas.length) { el.innerHTML = '<p class="sg-vazio">Nenhuma entrega registrada para esta pessoa.</p>'; return; }
        el.innerHTML = '<ul class="lista">' + r.entregas.map(e => `<li><span class="esq"><span class="forte">${e.tipo === 'CESTA' ? 'Cesta' : 'Itens avulsos'}${e.qtd ? ' · ' + esc(e.qtd + ' ' + (e.unidade || '')) : ''}</span>
          <span class="fraco">${esc(fmtDataHora(e.data))} · por ${esc(e.por || '—')}${e.obs ? ' · ' + esc(e.obs) : ''}</span></span></li>`).join('') + '</ul>';
      } }
    ],
    acoes: [
      ...(admin ? [{ rotulo: rec.ativo ? 'Inativar' : 'Reativar', ao: async () => {
        if (rec.ativo && !(await confirmar({ titulo: 'Inativar recebedor?', texto: rec.nome_completo + ' deixa de aparecer nas entregas. O histórico é mantido.', confirmar: 'Inativar', perigo: true }))) return;
        const x = await C.chamar({ action: 'recebedor_inativar', id_recebedor: id, ativo: !rec.ativo });
        if (!x.ok) { C.toast(x.error, 'erro'); return false; }
        await atualizarRecebedores();
      } }] : []),
      { rotulo: 'Editar', ao: async () => { fecharDialogo(); const s = await formRecebedor(C, rec); if (s) { await atualizarRecebedores(); abrirFicha(id); } else abrirFicha(id); return false; } },
      { rotulo: 'Fechar', estilo: 'ok' }
    ]
  });
}

// Formulário de cadastro/edição. Devolve { id_recebedor, nome_completo } ou null se desistir.
export function formRecebedor(ctx, ini = {}) {
  const Cx = ctx || C;
  return new Promise((resolve) => {
    let salvo = null;
    let campos = {};
    abrirDialogo({
      titulo: ini.id_recebedor ? 'Editar recebedor' : 'Novo recebedor',
      subtitulo: 'Só o nome completo é obrigatório.',
      abas: [{ id: 'f', rotulo: '', render: (el) => {
        const mk = (id, rot, val, ph, tipo) => `<label class="sg-campo" style="margin-bottom:10px">${rot}<input data-k="${id}" type="${tipo || 'text'}" value="${esc(val || '')}" placeholder="${esc(ph || '')}" autocomplete="off"></label>`;
        el.innerHTML = mk('nome_completo', 'Nome completo *', ini.nome_completo, 'Nome e sobrenome') +
          mk('telefone', 'Telefone (opcional)', ini.telefone, '(00) 00000-0000', 'tel') +
          mk('endereco', 'Endereço (opcional)', ini.endereco, 'Rua, número, bairro') +
          mk('email', 'E-mail (opcional)', ini.email, '', 'email') +
          mk('observacao', 'Observação (opcional)', ini.observacao, 'Ex.: filha da dona Cida — ajuda a diferenciar homônimos') +
          '<p class="sg-ajuda" id="rec-erro" style="color:var(--vermelho)" hidden></p>';
        el.querySelectorAll('input[data-k]').forEach(i => { campos[i.dataset.k] = i; });
        setTimeout(() => campos.nome_completo.focus(), 0);
      } }],
      acoes: [
        { rotulo: 'Cancelar' },
        { rotulo: 'Salvar', estilo: 'ok', ao: async () => {
          const erro = document.querySelector('#rec-erro');
          const corpo = { action: 'recebedor_salvar', id_recebedor: ini.id_recebedor || '' };
          Object.keys(campos).forEach(k => { corpo[k] = campos[k].value.trim(); });
          const mostra = (t) => { erro.textContent = t; erro.hidden = false; };
          let r = await Cx.chamar(corpo);
          if (!r.ok && r.duplicado) {
            // homônimo: só passa com observação que diferencie
            if (!corpo.observacao) { mostra(r.error); campos.observacao.focus(); return false; }
            r = await Cx.chamar({ ...corpo, forcar_homonimo: true });
          }
          if (!r.ok) { mostra(r.error); return false; }
          salvo = { id_recebedor: r.id_recebedor, nome_completo: r.nome_completo };
          Cx.toast(r.criado ? 'Recebedor cadastrado' : 'Dados atualizados');
        } }
      ],
      aoFechar: () => resolve(salvo)
    });
  });
}

// Seletor: busca entre os cadastrados, ou cadastra um novo. Devolve { id_recebedor, nome_completo } ou null.
export async function escolherRecebedor(ctx, { titulo = 'Quem recebe?', busca = '' } = {}) {
  const Cx = ctx || C;
  const lista = (await listarRecebedores()).filter(r => r.ativo);
  let escolha = null;
  await new Promise((resolve) => {
    abrirDialogo({
      titulo, subtitulo: 'Escolha na lista ou cadastre alguém novo.',
      abas: [{ id: 's', rotulo: '', render: (el) => {
        el.innerHTML = '<input type="search" class="busca" id="rec-pick-busca" placeholder="Buscar pelo nome" style="width:100%;margin-bottom:10px" autocomplete="off"><ul class="lista" id="rec-pick-lista" style="max-height:46vh;overflow:auto"></ul>';
        const inp = el.querySelector('#rec-pick-busca');
        const ul = el.querySelector('#rec-pick-lista');
        inp.value = busca;
        const desenha = () => {
          const q = semAcento(inp.value);
          const f = lista.filter(r => !q || semAcento(r.nome_completo).includes(q)).slice(0, 80);
          ul.innerHTML = f.length ? f.map(r => `<li data-id="${esc(r.id_recebedor)}" tabindex="0" style="cursor:pointer"><span class="esq"><span class="forte">${esc(r.nome_completo)}</span>
            <span class="fraco">${r.ultima_cesta ? 'última cesta ' + esc(fmtData(r.ultima_cesta)) : 'nunca recebeu'}</span></span>
            <span class="dir">${r.recebeu_mes ? '<span class="badge ambar">recebeu este mês</span>' : ''}</span></li>`).join('')
            : '<li class="vazio">Ninguém com esse nome — use “Cadastrar novo”.</li>';
        };
        const pega = (li) => { const r = lista.find(x => x.id_recebedor === li.dataset.id); if (r) { escolha = { id_recebedor: r.id_recebedor, nome_completo: r.nome_completo }; fecharDialogo(); } };
        ul.addEventListener('click', (e) => { const li = e.target.closest('li[data-id]'); if (li) pega(li); });
        ul.addEventListener('keydown', (e) => { const li = e.target.closest('li[data-id]'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pega(li); } });
        inp.addEventListener('input', desenha);
        desenha();
        setTimeout(() => inp.focus(), 0);
      } }],
      acoes: [
        { rotulo: 'Cancelar' },
        { rotulo: '+ Cadastrar novo', estilo: 'ok', ao: () => { escolha = { novo: true, nome: (document.querySelector('#rec-pick-busca') || {}).value || '' }; } }
      ],
      aoFechar: resolve
    });
  });
  if (escolha && escolha.novo) {
    const s = await formRecebedor(Cx, { nome_completo: escolha.nome });
    if (s) { await listarRecebedores(true); return s; }
    return null;
  }
  return escolha;
}

// Procura recebedor ativo pelo nome exato (sem caixa/acento) — liga a entrega ao cadastro sem clique extra.
export function acharRecebedor(nome) {
  const k = semAcento(nome);
  return k ? (todos.find(r => r.ativo && semAcento(r.nome_completo) === k) || null) : null;
}

// Entrega com recebedor: se já recebeu cesta neste mês, pergunta (com motivo opcional) e reenvia confirmando.
export async function chamarEntrega(ctx, corpo) {
  const Cx = ctx || C;
  const r = await Cx.chamar(corpo);
  if (r.ok || r.aviso !== 'JA_RECEBEU') return r;
  const motivo = await new Promise((resolve) => {
    let campo, resp = false;
    abrirDialogo({
      titulo: 'Já recebeu cesta neste mês',
      abas: [{ id: 'm', rotulo: '', render: (el) => {
        el.innerHTML = '<div class="sg-simbolo"><div class="sg-ic aviso"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg></div><div class="sg-txt"><p>' + esc(r.error) + '</p></div></div>' +
          '<label class="sg-campo" style="margin-top:14px">Motivo para entregar de novo (opcional)<input type="text" autocomplete="off" placeholder="Ex.: família numerosa"></label>' +
          '<p class="sg-ajuda">Pode entregar mesmo assim. O administrador será avisado.</p>';
        campo = el.querySelector('input');
      } }],
      acoes: [
        { rotulo: 'Cancelar' },
        { rotulo: 'Entregar mesmo assim', estilo: 'ok', ao: () => { resp = true; resolve(campo.value); } }
      ],
      aoFechar: () => { if (!resp) resolve(null); }
    });
  });
  if (motivo === null) return { ok: false, cancelado: true, error: 'Entrega cancelada — nada saiu do estoque.' };
  return Cx.chamar({ ...corpo, confirmar_repetido: true, motivo_repetido: motivo.trim() });
}
