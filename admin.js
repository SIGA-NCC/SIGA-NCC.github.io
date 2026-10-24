// admin.js — aba Admin (só ADMIN): solicitações, usuários, produtos,
// configuração e diagnóstico. Todas as ações exigem papel ADMIN no backend.

import { avisar, confirmar, perguntar } from './sigma-dialogo.js';
import { esc, fmtData, fmtDataHora } from './ui.js';

let C = null;

export function iniciarAdmin(ctx) {
  C = ctx;
  if (!(ctx.usuario && ctx.usuario.admin)) return;

  document.querySelector('#btn-atualizar-admin').addEventListener('click', () => atualizarAdmin().catch(e => C.toast(e.message, 'erro')));
  document.querySelector('#adm-sol-status').addEventListener('change', () => carregarSolicitacoes().catch(e => C.toast(e.message, 'erro')));
  document.querySelector('#corpo-solicitacoes').addEventListener('click', onSolicitacao);
  document.querySelector('#corpo-usuarios').addEventListener('click', onUsuario);
  document.querySelector('#corpo-produtos').addEventListener('click', onProduto);
  document.querySelector('#corpo-config').addEventListener('click', onConfig);
  document.querySelector('#form-usuario').addEventListener('submit', onCriarUsuario);
  document.querySelector('#form-produto').addEventListener('submit', onCriarProduto);
  document.querySelector('#form-config').addEventListener('submit', onDefinirConfig);
  document.querySelector('#btn-saude').addEventListener('click', carregarSaude);
  document.querySelector('#btn-gerar-alertas').addEventListener('click', onGerarAlertas);
  document.querySelector('#btn-instalar-gatilho').addEventListener('click', onInstalarGatilho);
  document.querySelector('#btn-precos').addEventListener('click', onAtualizarPrecos);
}

async function onGerarAlertas() {
  const btn = document.querySelector('#btn-gerar-alertas');
  btn.disabled = true;
  try {
    const r = await C.chamar({ action: 'gerar_alertas' });
    if (!r.ok) throw new Error(r.error);
    C.toast(r.criados > 0 ? 'Alertas novos: ' + r.criados : 'Nenhum alerta novo');
    await C.recarregarPainel();
  } catch (err) {
    C.toast(err.message, 'erro');
  } finally {
    btn.disabled = false;
  }
}

async function onInstalarGatilho() {
  const btn = document.querySelector('#btn-instalar-gatilho');
  btn.disabled = true;
  try {
    const r = await C.chamar({ action: 'instalar_gatilho' });
    if (!r.ok) throw new Error(r.error);
    C.toast(r.mensagem || 'Gatilho instalado');
  } catch (err) {
    C.toast(err.message, 'erro');
  } finally {
    btn.disabled = false;
  }
}

export async function atualizarAdmin() {
  if (!(C && C.usuario && C.usuario.admin)) return;
  await Promise.all([
    carregarSolicitacoes(),
    carregarUsuarios(),
    carregarProdutos(),
    carregarConfig(),
    carregarLogs()
  ]);
}

// ---------------- solicitações ----------------

async function carregarSolicitacoes() {
  const status = document.querySelector('#adm-sol-status').value;
  const r = await C.chamar({ action: 'listar_solicitacoes', status });
  const tb = document.querySelector('#corpo-solicitacoes');
  if (!r.ok) { tb.innerHTML = `<tr><td colspan="5" class="vazio">${esc(r.error)}</td></tr>`; return; }
  if (!r.solicitacoes.length) {
    tb.innerHTML = '<tr><td colspan="5" class="vazio">Nenhuma solicitação.</td></tr>';
    return;
  }
  tb.innerHTML = r.solicitacoes.map(s => {
    const pend = String(s.status).toUpperCase() === 'PENDENTE';
    const reset = String(s.tipo).toUpperCase() === 'RESET';
    const acoes = pend && reset
      ? `<button class="btn-mini" data-acao="aprovar" type="button">Aprovar senha nova</button>
         <button class="btn-mini" data-acao="recusar" type="button">Recusar</button>`
      : pend
      ? `<select data-campo="papel" style="width:auto">
           <option value="VOLUNTARIO">Voluntário</option>
           <option value="ADMIN">Admin</option>
         </select>
         <button class="btn-mini" data-acao="aprovar" type="button">Aprovar</button>
         <button class="btn-mini" data-acao="recusar" type="button">Recusar</button>`
      : `<span class="badge ${String(s.status).toUpperCase() === 'APROVADA' ? 'ok' : 'riso'}">${esc(s.status)}</span>
         <span class="fraco">${esc(s.resolvido_por || '')} ${s.resolvido_em ? '· ' + esc(fmtDataHora(s.resolvido_em)) : ''}</span>`;
    const alerta = s.observacao && /ja existe|ATENCAO/i.test(s.observacao)
      ? `<br><span style="font-size:.78rem;color:#8A3A22">${esc(s.observacao)}</span>`
      : reset && s.observacao ? `<br><span class="fraco">${esc(s.observacao)}</span>` : '';
    return `<tr data-id="${esc(s.id_solicitacao)}" data-tipo="${reset ? 'RESET' : 'ACESSO'}">
      <td>${reset ? '<span class="badge">nova senha</span> ' : ''}<strong>${esc(s.nome_completo)}</strong>${alerta}</td>
      <td>${esc(s.telefone || '—')}<br><span class="fraco">${esc(s.email || '')}</span></td>
      <td>${esc(s.motivo || '—')}<br><span class="fraco">${esc(fmtDataHora(s.timestamp))}</span></td>
      <td>${esc(s.login_sugerido || '—')}</td>
      <td>${acoes}</td>
    </tr>`;
  }).join('');
}

async function onSolicitacao(e) {
  const btn = e.target.closest('button[data-acao]');
  if (!btn) return;
  const tr = btn.closest('tr[data-id]');
  const id_solicitacao = tr.dataset.id;
  const acao = btn.dataset.acao;
  const payload = { action: 'resolver_solicitacao', id_solicitacao, acao };
  if (acao === 'aprovar' && tr.dataset.tipo === 'RESET') {
    if (!(await confirmar({ titulo: 'Aprovar senha nova', icone: 'aviso', confirmar: 'Aprovar',
      texto: 'Aprovar a senha nova que "' + (tr.querySelector('td:nth-child(4)').textContent.trim()) + '" escolheu?\nConfira se foi mesmo a pessoa que pediu (telefone). A senha antiga deixa de valer e ela sai dos outros aparelhos.' }))) return;
  } else if (acao === 'aprovar') {
    payload.papel = tr.querySelector('[data-campo="papel"]').value;
  } else {
    const motivo = await perguntar({ titulo: 'Recusar pedido', rotulo: 'Motivo da recusa (obrigatório)', confirmar: 'Recusar' });
    if (!motivo) return;
    payload.observacao = motivo;
  }
  btn.disabled = true;
  try {
    const r = await C.chamar(payload);
    if (!r.ok) throw new Error(r.error);
    if (r.senha_temporaria) {
      await avisar({ titulo: 'Acesso aprovado', icone: 'ok',
        texto: 'Login:\n» ' + r.login + '\nSenha temporária:\n» ' + r.senha_temporaria +
          '\nEntregue ao voluntário. Ele troca a senha no 1º acesso.' });
    } else if (r.senha_redefinida) {
      C.toast('Senha nova aprovada para ' + r.login + '. Avise a pessoa que já pode entrar.', 'ok');
    } else {
      C.toast('Solicitação ' + (acao === 'aprovar' ? 'aprovada' : 'recusada'));
    }
    await carregarSolicitacoes();
    await carregarUsuarios();
  } catch (err) {
    C.toast(err.message, 'erro');
    btn.disabled = false;
  }
}

// ---------------- usuários ----------------

async function carregarUsuarios() {
  const r = await C.chamar({ action: 'listar_usuarios_adm' });
  const tb = document.querySelector('#corpo-usuarios');
  if (!r.ok) { tb.innerHTML = `<tr><td colspan="6" class="vazio">${esc(r.error)}</td></tr>`; return; }
  tb.innerHTML = r.usuarios.map(u => `<tr data-login="${esc(u.login)}">
    <td><strong>${esc(u.login)}</strong><br><span class="fraco">${esc(u.nome_completo || '')}</span></td>
    <td>${esc(u.telefone || '—')}<br><span class="fraco">${esc(u.email || '')}</span></td>
    <td>
      <select data-campo="papel" style="width:auto">
        <option value="VOLUNTARIO" ${u.papel === 'VOLUNTARIO' ? 'selected' : ''}>Voluntário</option>
        <option value="ADMIN" ${u.papel === 'ADMIN' ? 'selected' : ''}>Admin</option>
      </select>
      <button class="btn-mini" data-acao="papel" type="button">Salvar</button>
    </td>
    <td><span class="badge ${u.ativo ? 'ok' : 'riso'}">${u.ativo ? 'ativo' : 'inativo'}</span>
        ${u.forcar_troca_senha ? '<br><span class="fraco">troca pendente</span>' : ''}</td>
    <td>${esc(u.ultimo_login ? fmtDataHora(u.ultimo_login) : '—')}</td>
    <td>
      <button class="btn-mini" data-acao="${u.ativo ? 'desativar' : 'ativar'}" type="button">${u.ativo ? 'Desativar' : 'Ativar'}</button>
    </td>
  </tr>`).join('');
}

async function onUsuario(e) {
  const btn = e.target.closest('button[data-acao]');
  if (!btn) return;
  const tr = btn.closest('tr[data-login]');
  const login = tr.dataset.login;
  const acao = btn.dataset.acao;

  if (acao === 'desativar' && !(await confirmar({ titulo: 'Desativar acesso', perigo: true, confirmar: 'Desativar',
    texto: 'Desativar o acesso de "' + login + '"?\nA pessoa sai na hora de todos os aparelhos. Dá para reativar depois.' }))) return;

  const payload = { action: 'manter_usuario', login };
  if (acao === 'papel') { payload.operacao = 'editar'; payload.papel = tr.querySelector('[data-campo="papel"]').value; }
  else payload.operacao = acao; // ativar | desativar

  btn.disabled = true;
  try {
    const r = await C.chamar(payload);
    if (!r.ok) throw new Error(r.error);
    C.toast('Usuário atualizado');
    await carregarUsuarios();
  } catch (err) {
    C.toast(err.message, 'erro');
    btn.disabled = false;
  }
}

async function onCriarUsuario(e) {
  e.preventDefault();
  const erro = document.querySelector('#erro-usuario');
  erro.classList.remove('visivel');
  try {
    const r = await C.chamar({
      action: 'criar_usuario',
      nome_completo: document.querySelector('#u-nome').value.trim(),
      login: document.querySelector('#u-login').value.trim(),
      papel: document.querySelector('#u-papel').value,
      senha_temporaria: document.querySelector('#u-senha').value.trim()
    });
    if (!r.ok) throw new Error(r.error);
    await avisar({ titulo: 'Usuário criado', icone: 'ok',
      texto: 'Login:\n» ' + r.login + '\nSenha temporária:\n» ' + r.senha_temporaria +
        '\nEntregue a senha. A troca no 1º acesso é obrigatória.' });
    e.target.reset();
    await carregarUsuarios();
  } catch (err) {
    erro.textContent = err.message;
    erro.classList.add('visivel');
  }
}

// ---------------- produtos ----------------

async function carregarProdutos() {
  const r = await C.chamar({ action: 'produtos_listar' });
  const tb = document.querySelector('#corpo-produtos');
  if (!r.ok) { tb.innerHTML = `<tr><td colspan="8" class="vazio">${esc(r.error)}</td></tr>`; return; }
  tb.innerHTML = r.produtos.map(p => `<tr data-id="${esc(p.id_produto)}">
    <td><span class="fraco">${esc(p.id_produto)}</span></td>
    <td><input data-campo="nome" value="${esc(p.nome)}"></td>
    <td><input data-campo="unidade" value="${esc(p.unidade)}" style="width:5rem"></td>
    <td><input data-campo="qtd_padrao_cesta" type="number" step="any" value="${esc(p.qtd_padrao_cesta)}" style="width:5rem"></td>
    <td><input data-campo="unidade_cesta" value="${esc(p.unidade_cesta)}" style="width:5rem"></td>
    <td><input data-campo="preco_estimado" type="number" step="0.0001" value="${esc(p.preco_estimado)}" style="width:5.5rem">
      <br><span class="fraco">${p.preco_fonte === 'ADM' ? 'ADM' : p.preco_fonte === 'AUTO' ? 'automático' : (Number(p.preco_estimado) ? '' : 'sem preço')}${/^g$/i.test(p.unidade) ? ' · por grama' : ''}</span></td>
    <td><input data-campo="validade_dias_alerta" type="number" value="${esc(p.validade_dias_alerta)}" style="width:4.5rem"></td>
    <td>
      <button class="btn-mini" data-acao="salvar" type="button">Salvar</button>
      <button class="btn-mini" data-acao="${p.ativo ? 'desativar' : 'ativar'}" type="button">${p.ativo ? 'Desativar' : 'Ativar'}</button>
    </td>
  </tr>`).join('');
}

async function onAtualizarPrecos(e) {
  const btn = e.target;
  btn.disabled = true; btn.textContent = 'Consultando o IBGE…';
  try {
    const r = await C.chamar({ action: 'precos_atualizar' });
    if (!r.ok) throw new Error(r.error);
    C.toast(r.produtos + ' preços recalculados · IBGE: ' + r.ibge, /falhou/.test(r.ibge) ? 'erro' : 'ok');
    await carregarProdutos();
  } catch (err) { C.toast(err.message, 'erro'); }
  btn.disabled = false; btn.textContent = 'Atualizar preços agora';
}

function valorProd(tr, campo) { return tr.querySelector('[data-campo="' + campo + '"]').value; }

async function onProduto(e) {
  const btn = e.target.closest('button[data-acao]');
  if (!btn) return;
  const tr = btn.closest('tr[data-id]');
  const id_produto = tr.dataset.id;
  const acao = btn.dataset.acao;
  const payload = { action: 'produtos_manter', id_produto };
  if (acao === 'salvar') {
    payload.operacao = 'editar';
    payload.nome = valorProd(tr, 'nome');
    payload.unidade = valorProd(tr, 'unidade');
    payload.qtd_padrao_cesta = valorProd(tr, 'qtd_padrao_cesta');
    payload.unidade_cesta = valorProd(tr, 'unidade_cesta');
    payload.preco_estimado = valorProd(tr, 'preco_estimado');
    payload.validade_dias_alerta = valorProd(tr, 'validade_dias_alerta');
  } else {
    payload.operacao = acao;
  }
  btn.disabled = true;
  try {
    const r = await C.chamar(payload);
    if (!r.ok) throw new Error(r.error);
    C.toast('Produto atualizado');
    await carregarProdutos();
  } catch (err) {
    C.toast(err.message, 'erro');
    btn.disabled = false;
  }
}

const CATEGORIAS = ['GRAO', 'ENLATADO', 'TEMPERO', 'BEBIDA', 'DOCE', 'OUTRO'];

async function onCriarProduto(e) {
  e.preventDefault();
  const erro = document.querySelector('#erro-produto');
  erro.classList.remove('visivel');
  try {
    const r = await C.chamar({
      action: 'produtos_manter', operacao: 'criar',
      nome: document.querySelector('#p-nome').value.trim(),
      unidade: document.querySelector('#p-unidade').value.trim() || 'un',
      categoria: document.querySelector('#p-categoria').value,
      qtd_padrao_cesta: document.querySelector('#p-qtd').value,
      unidade_cesta: document.querySelector('#p-unidade-cesta').value.trim(),
      preco_estimado: document.querySelector('#p-preco').value,
      validade_dias_alerta: document.querySelector('#p-validade').value
    });
    if (!r.ok) throw new Error(r.error);
    C.toast('Produto criado: ' + r.id_produto);
    e.target.reset();
    await carregarProdutos();
  } catch (err) {
    erro.textContent = err.message;
    erro.classList.add('visivel');
  }
}

// ---------------- config / diagnóstico ----------------

async function carregarConfig() {
  const r = await C.chamar({ action: 'config_listar' });
  const tb = document.querySelector('#corpo-config');
  if (!r.ok) { tb.innerHTML = `<tr><td colspan="3" class="vazio">${esc(r.error)}</td></tr>`; return; }
  if (!r.config.length) {
    tb.innerHTML = '<tr><td colspan="3" class="vazio">Sem configurações. Adicione uma abaixo.</td></tr>';
    return;
  }
  tb.innerHTML = r.config.map(c => `<tr data-chave="${esc(c.chave)}">
    <td><strong>${esc(c.chave)}</strong><br><span class="fraco">${esc(c.descricao || '')}</span></td>
    <td><input data-campo="valor" value="${esc(c.valor)}"></td>
    <td><button class="btn-mini" data-acao="salvar-config" type="button">Salvar</button></td>
  </tr>`).join('');
}

async function onConfig(e) {
  const btn = e.target.closest('button[data-acao="salvar-config"]');
  if (!btn) return;
  const tr = btn.closest('tr[data-chave]');
  btn.disabled = true;
  try {
    const r = await C.chamar({
      action: 'config_definir', chave: tr.dataset.chave,
      valor: tr.querySelector('[data-campo="valor"]').value
    });
    if (!r.ok) throw new Error(r.error);
    C.toast('Configuração salva');
  } catch (err) {
    C.toast(err.message, 'erro');
  } finally {
    btn.disabled = false;
  }
}

async function onDefinirConfig(e) {
  e.preventDefault();
  try {
    const r = await C.chamar({
      action: 'config_definir',
      chave: document.querySelector('#cfg-chave').value.trim(),
      valor: document.querySelector('#cfg-valor').value
    });
    if (!r.ok) throw new Error(r.error);
    C.toast('Configuração ' + r.acao);
    e.target.reset();
    await carregarConfig();
  } catch (err) {
    C.toast(err.message, 'erro');
  }
}

async function carregarSaude() {
  const pre = document.querySelector('#adm-saude');
  pre.textContent = 'Verificando…';
  const r = await C.chamar({ action: 'saude_planilha' });
  if (!r.ok) { pre.textContent = r.error; return; }
  const abas = r.abas.map(a => '  ' + (a.nome + '                 ').slice(0, 20) + a.linhas + ' linha(s)' + (a.oculta ? ' (oculta)' : '')).join('\n');
  pre.textContent =
    'Schema: ' + (r.schema_versao || '(sem versão)') + ' · sessão ' + r.sessao_horas + 'h\n' +
    'Segredos: pepper=' + (r.segredos.NCC_PEPPER ? 'ok' : 'FALTA') +
    ' · session=' + (r.segredos.NCC_SESSION_SECRET ? 'ok' : 'FALTA') + '\n' +
    'Abas:\n' + abas;
}

async function carregarLogs() {
  const r = await C.chamar({ action: 'log_auditoria', limite: 50 });
  const tb = document.querySelector('#corpo-logs');
  if (!r.ok) { tb.innerHTML = `<tr><td colspan="3" class="vazio">${esc(r.error)}</td></tr>`; return; }
  tb.innerHTML = r.logs.map(l => `<tr>
    <td>${esc(fmtDataHora(l.timestamp))}</td>
    <td>${esc(l.usuario_login || '—')}</td>
    <td><strong>${esc(l.acao)}</strong><br><span class="fraco">${esc(l.detalhe || '')}</span></td>
  </tr>`).join('');
}
