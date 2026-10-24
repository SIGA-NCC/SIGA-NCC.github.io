// escala.js — aba Escala: convocação de voluntários por data + tarefa, com vagas.
// Voluntário se inscreve/sai sozinho; o ADM edita, preenche vagas (usuário ou nome livre) e gera a imagem p/ WhatsApp.

import { esc } from './ui.js';
import { vazioComVerso, esqueleto } from './fx.js';
import { abrirDialogo, fecharDialogo, confirmar } from './sigma-dialogo.js';
import { mostrarImagemEscala, dataExtenso } from './imagem-escala.js';

let C = null;
let convs = [];
let usuariosCache = null;   // só ADM (listar_usuarios_adm)
const $ = (s) => document.querySelector(s);
const admin = () => !!(C && C.usuario && C.usuario.admin);

export function iniciarEscala(ctx) {
  C = ctx;
  $('#btn-atualizar-escala').addEventListener('click', () => atualizarEscala().catch(e => C.toast(e.message, 'erro')));
  if (admin()) {
    $('#btn-nova-conv').hidden = false;
    $('#btn-nova-conv').addEventListener('click', () => editarConv(null));
  }
  $('#esc-lista').addEventListener('click', onClique);
}

export async function atualizarEscala() {
  esqueleto($('#esc-lista'), 3);
  const r = await C.chamar({ action: 'conv_listar', incluir_fechadas: admin() });
  if (!r.ok) throw new Error(r.error);
  convs = r.convocacoes;
  render();
}

function resumoVagas(c) {
  const tot = c.vagas.reduce((s, v) => s + v.vagas_total, 0);
  const oc = c.vagas.reduce((s, v) => s + v.inscritos.length, 0);
  return { tot, oc, livres: tot - oc };
}

function render() {
  const box = $('#esc-lista');
  const abertas = convs.filter(c => c.status === 'ABERTA');
  $('#esc-resumo').textContent = abertas.length ? abertas.length + ' convocação(ões) aberta(s)' : '';
  if (!convs.length) {
    box.innerHTML = '<div class="lista">' + vazioComVerso(admin() ? 'Nenhuma convocação. Toque em “Nova convocação”.' : 'Nenhuma convocação aberta no momento.', 'servir') + '</div>';
    return;
  }
  box.innerHTML = convs.map(c => {
    const rs = resumoVagas(c);
    const eu = new Set();
    c.vagas.forEach(v => v.inscritos.forEach(i => { if (i.eu) eu.add(v.id_vaga); }));
    return `<article class="esc-conv" data-conv="${esc(c.id_conv)}" style="border:1px solid var(--borda);border-radius:var(--r-lg);padding:16px;margin-bottom:16px;background:var(--cartao)">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
        <div>
          <h3 style="font-family:Fraunces,serif;font-size:1.2rem;margin:0">${esc(c.titulo)} ${c.status !== 'ABERTA' ? '<span class="badge">' + esc(c.status.toLowerCase()) + '</span>' : ''}</h3>
          <div style="color:var(--tinta-fraca);font-size:.88rem;margin-top:2px">${esc(dataExtenso(c.data))}${c.hora ? ' · ' + esc(c.hora) : ''}${c.local ? ' · ' + esc(c.local) : ''}</div>
          ${c.descricao ? '<div style="font-size:.85rem;margin-top:4px">' + esc(c.descricao) + '</div>' : ''}
        </div>
        <span class="badge ${rs.livres ? 'ambar' : 'ok'}">${rs.livres ? rs.livres + ' vaga(s) livre(s)' : 'escala completa'}</span>
      </div>
      <ul class="lista" style="margin-top:10px">
        ${c.vagas.map(v => {
          const cheia = v.inscritos.length >= v.vagas_total;
          const nomes = v.inscritos.map(i => `<span class="badge ok" style="margin:2px 4px 2px 0">${esc(i.nome)}${i.eu ? ' (você)' : ''}${admin() && c.status === 'ABERTA' ? ` <button type="button" data-acao="tirar" data-insc="${esc(i.id_insc)}" aria-label="Remover ${esc(i.nome)}" style="border:0;background:none;cursor:pointer;color:inherit;font-size:1rem;line-height:1">×</button>` : ''}</span>`).join('');
          const livres = Array.from({ length: Math.min(Math.max(0, v.vagas_total - v.inscritos.length), 12) }, () => '<span class="badge ambar" style="margin:2px 4px 2px 0;border-style:dashed">vaga livre</span>').join('');
          return `<li data-vaga="${esc(v.id_vaga)}" style="flex-wrap:wrap">
            <span class="esq" style="flex:1 1 220px"><span class="forte">${esc(v.tarefa)} <span class="fraco">· ${v.inscritos.length}/${v.vagas_total}</span></span>
              <span>${nomes}${livres}</span></span>
            <span class="dir">${c.status === 'ABERTA' ? [
              eu.has(v.id_vaga) ? '<button type="button" class="btn-mini" data-acao="sair">Sair</button>'
                : (!cheia ? '<button type="button" class="btn-mini" data-acao="entrar">Me inscrever</button>' : ''),
              admin() && !cheia ? '<button type="button" class="btn-mini" data-acao="preencher">+ Adicionar pessoa</button>' : ''
            ].join('') : ''}</span>
          </li>`;
        }).join('')}
      </ul>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
        <button type="button" class="btn" data-acao="imagem">Gerar imagem p/ WhatsApp</button>
        ${admin() ? `<button type="button" class="btn-mini" data-acao="editar">Editar</button>
          ${c.status === 'ABERTA' ? '<button type="button" class="btn-mini" data-acao="fechar">Encerrar</button>' : '<button type="button" class="btn-mini" data-acao="reabrir">Reabrir</button>'}
          <button type="button" class="btn-mini" data-acao="excluir">Excluir</button>` : ''}
      </div>
    </article>`;
  }).join('');
}

async function onClique(e) {
  const b = e.target.closest('button[data-acao]');
  if (!b) return;
  const conv = convs.find(c => c.id_conv === b.closest('[data-conv]').dataset.conv);
  const li = b.closest('li[data-vaga]');
  const acao = b.dataset.acao;
  try {
    if (acao === 'imagem') return await mostrarImagemEscala(conv, C.toast);
    if (acao === 'editar') return editarConv(conv);
    if (acao === 'fechar' || acao === 'reabrir') return await mudarStatus(conv, acao === 'fechar' ? 'FECHADA' : 'ABERTA');
    if (acao === 'excluir') {
      if (!(await confirmar({ titulo: 'Excluir convocação?', texto: '“' + conv.titulo + '” e as inscrições dela saem da lista. Para só tirar da vista, use Encerrar.', confirmar: 'Excluir', perigo: true }))) return;
      return await mudarStatus(conv, 'EXCLUIDA');
    }
    if (acao === 'tirar') {
      const r = await C.chamar({ action: 'conv_remover_inscricao', id_insc: b.dataset.insc });
      if (!r.ok) throw new Error(r.error);
      C.toast('Pessoa removida da vaga');
    } else if (acao === 'entrar' || acao === 'sair') {
      const r = await C.chamar({ action: 'conv_inscrever', id_vaga: li.dataset.vaga, acao });
      if (!r.ok) throw new Error(r.error);
      C.toast(acao === 'entrar' ? 'Inscrição feita — obrigado!' : 'Você saiu da vaga');
    } else if (acao === 'preencher') {
      const feito = await preencherVaga(conv, li.dataset.vaga);
      if (!feito) return;
    }
    await atualizarEscala();
  } catch (err) {
    C.toast(err.message, 'erro');
    atualizarEscala().catch(() => {});
  }
}

async function mudarStatus(conv, status) {
  const r = await C.chamar({ action: 'conv_status', id_conv: conv.id_conv, status });
  if (!r.ok) throw new Error(r.error);
  C.toast(status === 'EXCLUIDA' ? 'Convocação excluída' : status === 'FECHADA' ? 'Convocação encerrada' : 'Convocação reaberta');
  await atualizarEscala();
}

// ADM: escolhe usuário do app OU digita um nome livre.
async function preencherVaga(conv, idVaga) {
  if (!usuariosCache) {
    const r = await C.chamar({ action: 'listar_usuarios_adm' });
    usuariosCache = r.ok ? r.usuarios.filter(u => u.ativo !== false) : [];
  }
  const vaga = conv.vagas.find(v => v.id_vaga === idVaga);
  const ja = new Set(vaga.inscritos.map(i => i.usuario_login).filter(Boolean));
  const disp = usuariosCache.filter(u => !ja.has(u.login));
  return new Promise((resolve) => {
    let feito = false;
    abrirDialogo({
      titulo: 'Adicionar em “' + vaga.tarefa + '”',
      subtitulo: 'Escolha um usuário do app ou escreva o nome de quem não tem login.',
      abas: [{ id: 'p', rotulo: '', render: (el) => {
        el.innerHTML = `<label class="sg-campo" style="margin-bottom:12px">Usuário do app
          <select id="esc-user" style="width:100%;padding:10px;border:1px solid var(--borda);border-radius:var(--r-sm);font:inherit"><option value="">— ninguém (usar nome livre) —</option>
          ${disp.map(u => `<option value="${esc(u.login)}">${esc(u.nome_completo || u.login)} (${esc(u.login)})</option>`).join('')}</select></label>
          <label class="sg-campo">…ou nome livre<input id="esc-livre" type="text" placeholder="Ex.: Dona Cida" autocomplete="off"></label>
          <p class="sg-ajuda" id="esc-erro" style="color:var(--vermelho)" hidden></p>`;
      } }],
      acoes: [
        { rotulo: 'Cancelar' },
        { rotulo: 'Adicionar', estilo: 'ok', ao: async () => {
          const usuario_login = document.querySelector('#esc-user').value;
          const nome_livre = document.querySelector('#esc-livre').value.trim();
          const r = await C.chamar({ action: 'conv_preencher', id_vaga: idVaga, usuario_login, nome_livre: usuario_login ? '' : nome_livre });
          if (!r.ok) { const er = document.querySelector('#esc-erro'); er.textContent = r.error; er.hidden = false; return false; }
          feito = true;
          C.toast('Pessoa adicionada');
        } }
      ],
      aoFechar: () => resolve(feito)
    });
  });
}

// Editor (criar/editar): dados + lista de tarefas com vagas.
function editarConv(conv) {
  const tarefas = conv ? conv.vagas.map(v => ({ id_vaga: v.id_vaga, tarefa: v.tarefa, vagas_total: v.vagas_total, n: v.inscritos.length }))
    : [{ id_vaga: '', tarefa: 'Separar os itens', vagas_total: 3, n: 0 }, { id_vaga: '', tarefa: 'Embalar', vagas_total: 2, n: 0 }, { id_vaga: '', tarefa: 'Organizar e entregar', vagas_total: 2, n: 0 }];
  abrirDialogo({
    titulo: conv ? 'Editar convocação' : 'Nova convocação',
    subtitulo: 'Defina o dia e as tarefas com o número de vagas.',
    abas: [{ id: 'e', rotulo: '', render: (el) => {
      const campo = (id, rot, val, tipo, ph) => `<label class="sg-campo" style="margin-bottom:10px">${rot}<input id="${id}" type="${tipo || 'text'}" value="${esc(val || '')}" placeholder="${esc(ph || '')}" autocomplete="off"></label>`;
      el.innerHTML = campo('cv-titulo', 'Título *', conv && conv.titulo, 'text', 'Ex.: Montagem das cestas de novembro') +
        '<div class="duas">' + campo('cv-data', 'Data *', conv && conv.data, 'date') + campo('cv-hora', 'Hora', conv && conv.hora, 'time') + '</div>' +
        campo('cv-local', 'Local', conv && conv.local, 'text', 'Ex.: Salão da igreja') +
        campo('cv-desc', 'Recado (aparece na imagem)', conv && conv.descricao, 'text', 'Ex.: Trazer avental') +
        '<div style="font-weight:600;margin:12px 0 6px">Tarefas e vagas</div><div id="cv-tarefas"></div>' +
        '<button type="button" class="btn-mini" id="cv-add" style="margin-top:8px">+ Tarefa</button>' +
        '<p class="sg-ajuda" id="cv-erro" style="color:var(--vermelho)" hidden></p>';
      const desenha = () => {
        el.querySelector('#cv-tarefas').innerHTML = tarefas.map((t, i) => `<div data-i="${i}" style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
          <input data-f="tarefa" value="${esc(t.tarefa)}" placeholder="Tarefa" style="flex:1;min-width:0" aria-label="Nome da tarefa">
          <input data-f="vagas_total" type="number" min="1" max="50" value="${t.vagas_total}" style="width:70px" aria-label="Vagas">
          <button type="button" class="btn-mini" data-rm="${i}" aria-label="Remover tarefa" ${t.n ? 'disabled title="Tem inscritos — remova-os antes"' : ''}>×</button></div>`).join('');
      };
      desenha();
      const lerTarefas = () => el.querySelectorAll('#cv-tarefas [data-i]').forEach(row => {
        const t = tarefas[Number(row.dataset.i)];
        t.tarefa = row.querySelector('[data-f=tarefa]').value; t.vagas_total = Number(row.querySelector('[data-f=vagas_total]').value);
      });
      el.querySelector('#cv-add').addEventListener('click', () => { lerTarefas(); tarefas.push({ id_vaga: '', tarefa: '', vagas_total: 2, n: 0 }); desenha(); });
      el.querySelector('#cv-tarefas').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-rm]');
        if (!b) return;
        lerTarefas(); tarefas.splice(Number(b.dataset.rm), 1); desenha();
      });
      setTimeout(() => el.querySelector('#cv-titulo').focus(), 0);
    } }],
    acoes: [
      { rotulo: 'Cancelar' },
      { rotulo: 'Salvar', estilo: 'ok', ao: async () => {
        document.querySelectorAll('#cv-tarefas [data-i]').forEach(row => {
          const t = tarefas[Number(row.dataset.i)];
          t.tarefa = row.querySelector('[data-f=tarefa]').value; t.vagas_total = Number(row.querySelector('[data-f=vagas_total]').value);
        });
        const erro = document.querySelector('#cv-erro');
        const falha = (m) => { erro.textContent = m; erro.hidden = false; return false; };
        const g = (id) => document.querySelector(id).value.trim();
        if (!g('#cv-titulo')) return falha('Informe o título.');
        if (!g('#cv-data')) return falha('Informe a data.');
        const lista = tarefas.filter(t => t.tarefa.trim());
        if (!lista.length) return falha('Inclua ao menos uma tarefa.');
        const r = await C.chamar({
          action: 'conv_salvar', id_conv: conv ? conv.id_conv : '', titulo: g('#cv-titulo'), data: g('#cv-data'), hora: g('#cv-hora'),
          local: g('#cv-local'), descricao: g('#cv-desc'),
          vagas_json: JSON.stringify(lista.map(t => ({ id_vaga: t.id_vaga, tarefa: t.tarefa.trim(), vagas_total: t.vagas_total })))
        });
        if (!r.ok) return falha(r.error);
        C.toast(conv ? 'Convocação atualizada' : 'Convocação criada');
        setTimeout(() => atualizarEscala().catch(() => {}), 0);
      } }
    ]
  });
}
