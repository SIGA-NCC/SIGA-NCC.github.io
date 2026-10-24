// alertas-adm.js — abas do ADM na central de notificações: "Enviar aviso" (alerta personalizado) e "Retorno"
// (quem viu / reconheceu / ignorou, com horário). Só o ADM chega aqui; o backend também exige papel ADMIN.

import { esc, fmtDataHora, hoje } from './ui.js';

const SEV = { URGENTE: { rot: 'Urgente', cls: 'riso' }, AVISO: { rot: 'Atenção', cls: 'ambar' }, INFO: { rot: 'Informativo', cls: '' } };
const hora = (iso) => (iso ? esc(fmtDataHora(iso)) : '<span class="sg-vazio">—</span>');

// ---------- Enviar aviso ----------
export async function abaEnviarAviso(el, C, { aoEnviar } = {}) {
  el.innerHTML = '<p class="sg-vazio">Carregando…</p>';
  const ru = await C.chamar({ action: 'listar_usuarios_adm' });
  const usuarios = ru.ok ? ru.usuarios.filter(u => u.ativo !== false) : [];
  el.innerHTML = `<form id="av-form" novalidate>
    <label class="sg-campo" style="margin-bottom:10px">Título *
      <input id="av-titulo" type="text" maxlength="100" placeholder="Ex.: Reunião de voluntários sábado" autocomplete="off"></label>
    <label class="sg-campo" style="margin-bottom:10px">Detalhes
      <textarea id="av-detalhes" maxlength="1000" placeholder="O que a pessoa precisa saber ou fazer"></textarea></label>
    <div class="duas" style="margin-bottom:10px">
      <label class="sg-campo">Gravidade
        <select id="av-sev" style="width:100%;padding:10px;border:1px solid var(--borda);border-radius:var(--r-sm);font:inherit">
          <option value="INFO">Informativo</option><option value="AVISO">Atenção</option><option value="URGENTE">Urgente</option></select></label>
      <label class="sg-campo">Válido até (opcional)
        <input id="av-expira" type="date" min="${hoje()}"></label>
    </div>
    <fieldset style="border:0;padding:0;margin:0 0 10px">
      <legend class="sg-campo" style="margin-bottom:6px">Quem recebe</legend>
      <div class="chips" role="radiogroup" id="av-dest-tipo">
        <label class="chip-radio"><input type="radio" name="av-dest" value="TODOS" checked><span>Todos</span></label>
        <label class="chip-radio"><input type="radio" name="av-dest" value="ADMIN"><span>Só administradores</span></label>
        <label class="chip-radio"><input type="radio" name="av-dest" value="ESCOLHER"><span>Escolher pessoas</span></label>
      </div>
      <div id="av-pessoas" hidden style="margin-top:8px;display:grid;gap:6px;max-height:160px;overflow:auto">
        ${usuarios.map(u => `<label style="display:flex;gap:8px;align-items:center;font-size:.9rem"><input type="checkbox" value="${esc(u.login)}"> ${esc(u.nome_completo || u.login)} <span class="fraco" style="color:var(--tinta-fraca)">(${esc(u.login)})</span></label>`).join('') || '<span class="sg-vazio">Nenhum usuário encontrado.</span>'}
      </div>
    </fieldset>
    <label style="display:flex;gap:8px;align-items:flex-start;font-size:.9rem;margin-bottom:12px">
      <input id="av-obrig" type="checkbox" style="margin-top:3px">
      <span><b>Leitura obrigatória</b> — o aviso abre sozinho ao entrar no app até a pessoa tocar em “Li e reconheço”. Não pode ser ignorado.</span></label>
    <p class="sg-ajuda" id="av-erro" style="color:var(--vermelho)" hidden></p>
    <button class="btn" id="av-enviar" type="submit">Enviar aviso</button>
  </form>`;
  const form = el.querySelector('#av-form');
  const pessoas = el.querySelector('#av-pessoas');
  form.querySelectorAll('input[name=av-dest]').forEach(r => r.addEventListener('change', () => {
    pessoas.hidden = form.querySelector('input[name=av-dest]:checked').value !== 'ESCOLHER';
  }));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const erro = el.querySelector('#av-erro');
    const falha = (m) => { erro.textContent = m; erro.hidden = false; };
    erro.hidden = true;
    const titulo = el.querySelector('#av-titulo').value.trim();
    if (!titulo) { falha('Informe o título.'); el.querySelector('#av-titulo').focus(); return; }
    let dest = form.querySelector('input[name=av-dest]:checked').value;
    if (dest === 'ESCOLHER') {
      const sel = [...pessoas.querySelectorAll('input:checked')].map(i => i.value);
      if (!sel.length) { falha('Marque pelo menos uma pessoa.'); return; }
      dest = sel.join(',');
    }
    const b = el.querySelector('#av-enviar');
    b.disabled = true;
    try {
      const r = await C.chamar({
        action: 'alerta_criar', titulo, detalhes: el.querySelector('#av-detalhes').value.trim(), severidade: el.querySelector('#av-sev').value,
        destinatarios: dest, obrigatoria: el.querySelector('#av-obrig').checked, expira_em: el.querySelector('#av-expira').value
      });
      if (!r.ok) { falha(r.error); return; }
      C.toast('Aviso enviado', 'ok');
      if (aoEnviar) aoEnviar(r);
    } catch (e) { falha(e.message); } finally { b.disabled = false; }
  });
}

// ---------- Retorno ----------
export async function abaRetorno(el, C) {
  el.innerHTML = '<p class="sg-vazio">Carregando…</p>';
  const r = await C.chamar({ action: 'alerta_retorno' });
  if (!r.ok) { el.innerHTML = '<p class="sg-vazio">' + esc(r.error) + '</p>'; return; }
  if (!r.alertas.length) { el.innerHTML = '<p class="sg-vazio">Nenhum alerta emitido ainda.</p>'; return; }
  el.innerHTML = '<p class="sg-ajuda">Cada pessoa marca uma única vez; o primeiro horário fica gravado. Toque num aviso para ver quem viu, reconheceu ou ignorou.</p><ul class="av-lista" id="ret-lista"></ul>';
  const ul = el.querySelector('#ret-lista');
  ul.innerHTML = r.alertas.map(a => {
    const sev = SEV[a.severidade] || SEV.INFO;
    return `<li class="av ${a.severidade === 'URGENTE' ? 'urg' : a.severidade === 'AVISO' ? 'aten' : 'info'}${a.resolvido ? ' feito' : ''}" data-ret="${esc(a.id_alerta)}" tabindex="0" role="button" aria-expanded="false">
      <span class="av-ponto" aria-hidden="true"></span>
      <span class="av-corpo"><span class="av-tit">${esc(a.titulo)} ${a.resolvido ? '<span class="badge">encerrado</span>' : ''}${a.obrigatoria ? ' <span class="badge riso">obrigatório</span>' : ''}</span>
        <span class="av-meta">${esc(sev.rot)} · ${esc(fmtDataHora(a.criado_em))} · ${a.origem === 'ADM' ? 'por ' + esc(a.criado_por) : 'sistema'}</span>
        <span class="av-meta"><b>${a.viram}/${a.total}</b> viram · <b>${a.reconheceram}/${a.total}</b> reconheceram</span>
        <span class="ret-det" hidden></span></span>
    </li>`;
  }).join('');
  const abrir = async (li) => {
    const det = li.querySelector('.ret-det');
    if (!det.hidden) { det.hidden = true; li.setAttribute('aria-expanded', 'false'); return; }
    det.hidden = false; li.setAttribute('aria-expanded', 'true');
    det.innerHTML = 'Carregando…';
    const d = await C.chamar({ action: 'alerta_retorno', id_alerta: li.dataset.ret });
    if (!d.ok) { det.textContent = d.error; return; }
    det.innerHTML = `<table class="ret-tab"><thead><tr><th>Pessoa</th><th>Viu</th><th>Reconheceu</th><th>Ignorou</th></tr></thead><tbody>` +
      d.pessoas.map(p => `<tr><td>${esc(p.nome)}</td><td>${hora(p.vista_em)}</td><td>${hora(p.reconhecida_em)}</td><td>${hora(p.ignorada_em)}</td></tr>`).join('') +
      '</tbody></table>';
  };
  ul.addEventListener('click', (e) => { const li = e.target.closest('[data-ret]'); if (li && !e.target.closest('.ret-det')) abrir(li); });
  ul.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { const li = e.target.closest('[data-ret]'); if (li) { e.preventDefault(); abrir(li); } } });
}
