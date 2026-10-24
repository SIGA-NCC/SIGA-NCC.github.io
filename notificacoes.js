// notificacoes.js — central de alertas/avisos do SIGA-NCC (modelo do SIGMA v2, D37/D41/D42).
// Sino no topo com contador (o bloco "Avisos" do Painel saiu a pedido do dono, D24) · diálogo central de detalhe (quando foi emitido,
// por quem, o que fazer) · cada pessoa marca visto/reconhecido/ignorado UMA vez (o ADM vê o retorno).
// Aviso do aparelho (Notification API) enquanto o app está aberto ou em segundo plano; com o app FECHADO não há
// push (precisa de servidor de push — etapa futura), o aviso só chega ao abrir.

import { esc, fmtDataHora } from './ui.js';
import { abrirDialogo, fecharDialogo, confirmar } from './sigma-dialogo.js';
import { abaEnviarAviso, abaRetorno } from './alertas-adm.js';

let C = null;
let lista = [];            // alertas da pessoa (alertas_listar)
let naoLidas = 0;
let obrigatorias = [];     // ids de leitura obrigatória ainda não reconhecidos
let timer = null;
let primeiraCarga = true;
let abrindoObrigatoria = false;
const $ = (s) => document.querySelector(s);
const SEV = { URGENTE: { rot: 'Urgente', cls: 'riso' }, AVISO: { rot: 'Atenção', cls: 'ambar' }, INFO: { rot: 'Informativo', cls: '' } };
const TIPOS = {
  VALIDADE: { aba: 'estoque', abrir: 'Ver no estoque', dica: 'Confira o lote no mapa do estoque. Se estiver vencido ou estragado, dê baixa com o motivo.' },
  ESTOQUE_BAIXO: { aba: 'receber', abrir: 'Registrar doação', dica: 'O saldo está abaixo do mínimo de cestas. Vale reforçar o pedido de doações.' },
  LIMPEZA: { aba: 'estoque', abrir: 'Abrir o estoque', dica: 'Aproveite para conferir validades e arrumar as prateleiras.' },
  RECEBEDOR_REPETIDO: { aba: 'recebedores', abrir: 'Ver recebedores', dica: 'Uma cesta foi liberada para quem já tinha recebido neste mês. Confira o motivo informado.' },
  PEDIDO_SENHA: { aba: 'admin', abrir: 'Abrir solicitações', dica: 'Confira o telefone e aprove ou recuse em Admin → Solicitações. Aprovando, vale a senha que a própria pessoa escolheu.' },
  SENHA_REDEFINIDA: { aba: '', abrir: '', dica: 'Se não foi você quem pediu a senha nova, avise o administrador.' },
  PERSONALIZADO: { aba: '', abrir: '', dica: '' }
};
const chave = () => 'siga:notif-avisados:' + ((C && C.usuario && C.usuario.login) || '');
const lerAvisados = () => { try { return new Set(JSON.parse(localStorage.getItem(chave()) || '[]')); } catch (e) { return new Set(); } };
const gravarAvisados = (set) => { try { localStorage.setItem(chave(), JSON.stringify([...set].slice(-200))); } catch (e) { /* sem storage: segue */ } };

export function iniciarNotificacoes(ctx) {
  C = ctx;
  $('#btn-sino').addEventListener('click', () => abrirCentral());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizarNotificacoes().catch(() => {}); });
  timer = setInterval(() => { if (!document.hidden) atualizarNotificacoes().catch(() => {}); }, 60000);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.tipo === 'abrir-alerta') abrirAlerta(e.data.id); });
  }
}

export const alertasAtuais = () => lista;

export async function atualizarNotificacoes() {
  const r = await C.chamar({ action: 'alertas_listar' });
  if (!r.ok) throw new Error(r.error);
  lista = r.alertas || [];
  naoLidas = r.nao_lidas || 0;
  obrigatorias = r.obrigatorias_pendentes || [];
  pintarSino();
  avisarNovos();
  if (primeiraCarga) {
    primeiraCarga = false;
    const alvo = new URLSearchParams(location.search).get('alerta');
    if (alvo) abrirAlerta(alvo);
  }
  exigirObrigatorias();
  return r;
}

// ---------- sino + selos do aparelho ----------
function pintarSino() {
  const n = $('#sino-n');
  n.hidden = !naoLidas;
  n.textContent = naoLidas > 99 ? '99+' : String(naoLidas);
  $('#btn-sino').setAttribute('aria-label', naoLidas ? 'Notificações: ' + naoLidas + ' não lida(s)' : 'Notificações');
  $('#btn-sino').classList.toggle('tem', naoLidas > 0);
  document.title = (naoLidas ? '(' + naoLidas + ') ' : '') + 'SIGA-NCC';
  try { if (naoLidas && navigator.setAppBadge) navigator.setAppBadge(naoLidas); else if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) { /* sem badge no aparelho */ }
  const kpi = $('#kpi-alertas');
  if (kpi) kpi.dataset.n = String(naoLidas);
}

// ---------- cartão de aviso (lista da central) ----------
function quando(iso) {
  const d = new Date(String(iso || ''));
  if (isNaN(d)) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return 'há ' + min + ' min';
  if (min < 60 * 24) return 'há ' + Math.round(min / 60) + ' h';
  if (min < 60 * 24 * 7) return 'há ' + Math.round(min / 1440) + ' d';
  return d.toLocaleDateString('pt-BR');
}

function cartaoHtml(a) {
  const sev = SEV[a.severidade] || SEV.INFO;
  const feito = !!(a.estado.reconhecida_em || a.estado.ignorada_em);
  return `<li class="av ${a.severidade === 'URGENTE' ? 'urg' : a.severidade === 'AVISO' ? 'aten' : 'info'}${feito ? ' feito' : ''}${a.estado.vista_em ? '' : ' novo'}" data-alerta="${esc(a.id_alerta)}" tabindex="0" role="button" aria-label="Abrir aviso: ${esc(a.titulo)}">
    <span class="av-ponto" aria-hidden="true"></span>
    <span class="av-corpo"><span class="av-tit">${esc(a.titulo)}${a.obrigatoria && !a.estado.reconhecida_em ? ' <span class="badge riso">leitura obrigatória</span>' : ''}</span>
      <span class="av-msg">${esc(a.tipo === 'PERSONALIZADO' ? (a.detalhes || '') : a.mensagem)}</span>
      <span class="av-meta">${esc(sev.rot)} · ${esc(quando(a.criado_em || a.data_disparo))}${a.origem === 'ADM' ? ' · aviso do administrador' : ''}${feito ? ' · ' + (a.estado.reconhecida_em ? 'reconhecido' : 'ignorado') : ''}</span></span>
    <span class="av-seta" aria-hidden="true">›</span>
  </li>`;
}

// ---------- aviso do aparelho (enquanto o app está aberto / em segundo plano) ----------
async function avisarNovos() {
  const visto = lerAvisados();
  const novos = lista.filter(a => !a.estado.vista_em && !visto.has(a.id_alerta));
  if (!novos.length) return;
  novos.forEach(a => visto.add(a.id_alerta));
  gravarAvisados(visto);
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return; // aberto na tela: o sino já mostra
  try {
    const reg = ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration() : null;
    const mostra = (titulo, opcoes) => (reg ? reg.showNotification(titulo, opcoes) : new Notification(titulo, opcoes));
    if (novos.length > 3) {
      await mostra('SIGA-NCC · ' + novos.length + ' avisos novos', { body: novos.slice(0, 3).map(a => a.titulo).join(' · '), tag: 'siga-varios', icon: './icones/icone-192.png', data: { id: '' } });
      return;
    }
    for (const a of novos) {
      await mostra(a.titulo, { body: (a.tipo === 'PERSONALIZADO' ? a.detalhes : a.mensagem).slice(0, 140), tag: a.id_alerta, icon: './icones/icone-192.png', badge: './icones/icone-192.png', data: { id: a.id_alerta } });
    }
  } catch (e) { /* aviso do aparelho é extra: nunca derruba o app */ }
}

async function pedirPermissao() {
  if (!('Notification' in window)) { C.toast('Este aparelho não oferece avisos do sistema', 'erro'); return; }
  const p = await Notification.requestPermission();
  C.toast(p === 'granted' ? 'Avisos do aparelho ligados' : 'Avisos do aparelho não foram permitidos', p === 'granted' ? 'ok' : 'erro');
}

// ---------- leitura obrigatória: abre sozinha até a pessoa reconhecer ----------
async function exigirObrigatorias() {
  if (abrindoObrigatoria || !obrigatorias.length) return;
  abrindoObrigatoria = true;
  try { await abrirAlerta(obrigatorias[0], { obrigatorio: true }); } finally { abrindoObrigatoria = false; }
}

// ---------- marcar (1 única vez; o servidor devolve o carimbo original se repetir) ----------
async function marcar(id, estado) {
  const r = await C.chamar({ action: 'alerta_marcar', id_alerta: id, estado });
  if (!r.ok) throw new Error(r.error);
  const a = lista.find(x => x.id_alerta === id);
  if (a && !a.estado[estado + '_em']) a.estado[estado + '_em'] = r.em || new Date().toISOString();
  if (a && estado !== 'clicada' && estado !== 'vista' && !a.estado.vista_em) a.estado.vista_em = a.estado[estado + '_em'];
  return r;
}

// ---------- diálogo central de detalhe ----------
export async function abrirAlerta(id, opc = {}) {
  let a = lista.find(x => x.id_alerta === id);
  if (!a) { await atualizarNotificacoes().catch(() => {}); a = lista.find(x => x.id_alerta === id); }
  if (!a) { C.toast('Esse aviso não está mais disponível', 'erro'); return; }
  const sev = SEV[a.severidade] || SEV.INFO;
  const tipo = TIPOS[a.tipo] || TIPOS.PERSONALIZADO;
  const admin = !!(C.usuario && C.usuario.admin);
  const dono = a.origem === 'ADM'
    ? 'Enviado por ' + esc(a.criado_por || 'administrador') + ' (administração)'
    : 'Gerado automaticamente pelo sistema';
  const texto = a.tipo === 'PERSONALIZADO' ? (a.detalhes || a.mensagem) : a.mensagem;
  const linha = (rot, v) => v ? `<div class="sg-par"><dt>${rot}</dt><dd>${v}</dd></div>` : '';
  const e = a.estado;
  const passos = [
    e.vista_em ? 'Visto em ' + esc(fmtDataHora(e.vista_em)) : '',
    e.clicada_em ? 'Aberto em ' + esc(fmtDataHora(e.clicada_em)) : '',
    e.reconhecida_em ? 'Reconhecido em ' + esc(fmtDataHora(e.reconhecida_em)) : '',
    e.ignorada_em ? 'Ignorado em ' + esc(fmtDataHora(e.ignorada_em)) : ''
  ].filter(Boolean);
  // abrir já conta como visto (passivo); reconhecer/ignorar são atos explícitos
  if (!e.vista_em) marcar(id, 'vista').then(() => pintarSino()).catch(() => {});

  return new Promise((resolve) => {
    let ato = false;
    const acoes = [];
    if (opc.voltar) acoes.push({ rotulo: '‹ Voltar', ao: () => { setTimeout(() => abrirCentral(), 0); return false; } });
    if (admin && !opc.obrigatorio) {
      acoes.push({ rotulo: 'Encerrar aviso', ao: async () => {
        if (!(await confirmar({ titulo: 'Encerrar este aviso?', texto: 'Ele sai da central de todos. O retorno de quem viu continua registrado.', confirmar: 'Encerrar', perigo: true }))) return;
        const r = await C.chamar({ action: 'alertas_resolver', id_alerta: id });
        if (!r.ok) { C.toast(r.error, 'erro'); return; }
        C.toast('Aviso encerrado');
        await atualizarNotificacoes().catch(() => {});
      } });
    }
    if (tipo.aba) {
      acoes.push({ rotulo: tipo.abrir, ao: async () => {
        marcar(id, 'clicada').catch(() => {});
        const b = document.querySelector('nav button[data-aba="' + tipo.aba + '"]');
        if (b) b.click();
      } });
    }
    if (!e.reconhecida_em && !e.ignorada_em && !a.obrigatoria) {
      acoes.push({ rotulo: 'Ignorar', ao: async () => { try { await marcar(id, 'ignorada'); ato = true; C.toast('Aviso ignorado'); } catch (er) { C.toast(er.message, 'erro'); return false; } } });
    }
    if (!e.reconhecida_em) {
      acoes.push({ rotulo: a.obrigatoria ? 'Li e reconheço' : 'Reconhecer', estilo: 'ok', ao: async () => { try { await marcar(id, 'reconhecida'); ato = true; C.toast('Aviso reconhecido', 'ok'); } catch (er) { C.toast(er.message, 'erro'); return false; } } });
    } else {
      acoes.push({ rotulo: 'Fechar', estilo: 'ok' });
    }
    abrirDialogo({
      titulo: a.titulo,
      subtitulo: sev.rot + ' · ' + (a.origem === 'ADM' ? 'aviso do administrador' : 'alerta do sistema'),
      abas: [{ id: 'd', rotulo: '', render: (el) => {
        el.innerHTML = `<div class="av-detalhe">
          <p class="av-texto">${esc(texto).replace(/\n/g, '<br>')}</p>
          ${tipo.dica ? '<p class="sg-ajuda">' + esc(tipo.dica) + '</p>' : ''}
          ${a.obrigatoria && !e.reconhecida_em ? '<p class="sg-ajuda" style="color:var(--vermelho)">Leitura obrigatória: toque em “Li e reconheço” para continuar.</p>' : ''}
          <dl class="sg-grade" style="margin-top:14px">
            ${linha('Emitido em', esc(fmtDataHora(a.criado_em || a.data_disparo)))}
            ${linha('Origem', dono)}
            ${linha('Gravidade', '<span class="badge ' + sev.cls + '">' + esc(sev.rot) + '</span>')}
            ${linha('Produto', esc(a.produto))}
            ${linha('Válido até', a.expira_em ? esc(new Date(a.expira_em + 'T12:00:00').toLocaleDateString('pt-BR')) : '')}
            ${admin ? linha('Quem recebe', esc(a.destinatarios === 'TODOS' ? 'Todos os usuários' : a.destinatarios === 'ADMIN' ? 'Só administradores' : a.destinatarios || '')) : ''}
            ${linha('Sua situação', passos.length ? passos.join('<br>') : 'Ainda não visto')}
          </dl></div>`;
      } }],
      acoes,
      aoFechar: () => { pintarSino(); if (ato) atualizarNotificacoes().catch(() => {}); resolve(ato); }
    });
  });
}

// ---------- central (sino) ----------
let filtroCentral = 'pend';
export function abrirCentral(aba) {
  const admin = !!(C.usuario && C.usuario.admin);
  const abas = [{ id: 'minhas', rotulo: 'Para mim' + (naoLidas ? ' (' + naoLidas + ')' : ''), render: (el) => renderMinhas(el) }];
  if (admin) {
    abas.push({ id: 'enviar', rotulo: 'Enviar aviso', render: (el) => abaEnviarAviso(el, C, { aoEnviar: () => { fecharDialogo(); atualizarNotificacoes().catch(() => {}); abrirCentral('retorno'); } }) });
    abas.push({ id: 'retorno', rotulo: 'Retorno', render: (el) => abaRetorno(el, C, { aoMudar: () => atualizarNotificacoes().catch(() => {}) }) });
  }
  abrirDialogo({ titulo: 'Notificações', subtitulo: 'Alertas do sistema e avisos do administrador', abas, abaInicial: aba || 'minhas', acoes: [{ rotulo: 'Fechar', estilo: 'ok' }] });
}

function renderMinhas(el) {
  const perm = ('Notification' in window) ? Notification.permission : 'indisponivel';
  const aparelho = perm === 'granted'
    ? '<span class="badge ok">avisos do aparelho: ligados</span>'
    : perm === 'denied' ? '<span class="badge">avisos do aparelho bloqueados nas configurações do navegador</span>'
    : perm === 'default' ? '<button type="button" class="btn-mini" id="ntf-ligar">Ativar avisos neste aparelho</button>'
    : '<span class="badge">este aparelho não oferece avisos do sistema</span>';
  el.innerHTML = `<div class="ntf-topo">${aparelho}
      <span class="chips" id="ntf-filtro" role="group" aria-label="Filtrar avisos">
        <button type="button" class="chip" data-f="pend" aria-pressed="${filtroCentral === 'pend'}">Pendentes</button>
        <button type="button" class="chip" data-f="novas" aria-pressed="${filtroCentral === 'novas'}">Novas</button>
        <button type="button" class="chip" data-f="todas" aria-pressed="${filtroCentral === 'todas'}">Todas</button>
      </span></div>
    <p class="sg-ajuda">Com o app aberto ou em segundo plano você recebe o aviso no aparelho. Com o app fechado, o aviso aparece quando você abrir.</p>
    <ul class="av-lista" id="ntf-lista"></ul>`;
  const desenha = () => {
    const ul = el.querySelector('#ntf-lista');
    const f = lista.filter(a => filtroCentral === 'todas' ? true : filtroCentral === 'novas' ? !a.estado.vista_em : !(a.estado.reconhecida_em || a.estado.ignorada_em));
    ul.innerHTML = f.length ? f.map(cartaoHtml).join('') : '<li class="vazio">Nada por aqui.</li>';
  };
  desenha();
  el.querySelector('#ntf-filtro').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-f]');
    if (!b) return;
    filtroCentral = b.dataset.f;
    el.querySelectorAll('#ntf-filtro .chip').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    desenha();
  });
  el.querySelector('#ntf-lista').addEventListener('click', (e) => { const c = e.target.closest('[data-alerta]'); if (c) abrirAlerta(c.dataset.alerta, { voltar: true }); });
  el.querySelector('#ntf-lista').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { const c = e.target.closest('[data-alerta]'); if (c) { e.preventDefault(); abrirAlerta(c.dataset.alerta, { voltar: true }); } }
  });
  const ligar = el.querySelector('#ntf-ligar');
  if (ligar) ligar.addEventListener('click', async () => { await pedirPermissao(); renderMinhas(el); });
}
