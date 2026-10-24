// Diálogo do SIGMA (2026-10-10) — caixa própria, no lugar das caixinhas do
// navegador (`prompt`/`confirm`), que destoavam do resto e no celular nem sempre
// aparecem. Serve para: ficha da peça (com abas), perguntar um texto e confirmar
// ação perigosa. O CSS vai injetado aqui mesmo para não precisar editar 19 HTMLs;
// usa os tokens do painel-gestor.css, então segue tema claro e escuro sozinho.

const CSS = `
.sg-dlg { margin: auto; border: 0; padding: 0; background: transparent; max-width: 100vw; max-height: 100vh; }
.sg-dlg::backdrop { background: rgba(10, 16, 24, .55); backdrop-filter: blur(2px); }
.sg-cx { background: var(--cartao); color: var(--txt); border: 1px solid var(--borda);
  border-radius: var(--r-lg); box-shadow: 0 18px 50px rgba(10, 16, 24, .28);
  width: min(680px, calc(100vw - 2 * var(--sp-4))); max-height: calc(100vh - 2 * var(--sp-5));
  display: flex; flex-direction: column; overflow: hidden; }
.sg-topo { display: flex; align-items: flex-start; gap: var(--sp-3); padding: var(--sp-4) var(--sp-5);
  border-bottom: 1px solid var(--borda); background: var(--cartao-alto); }
.sg-topo .sg-tit { margin: 0; font-size: var(--fs-lg); font-weight: 700; flex: 1; }
.sg-topo .sg-sub { margin: var(--sp-1) 0 0; font-size: var(--fs-sm); color: var(--txt2); font-weight: 400; }
.sg-x { border: 1px solid transparent; background: transparent; color: var(--txt2); cursor: pointer;
  font-size: 22px; line-height: 1; min-width: var(--touch-min); min-height: var(--touch-min);
  border-radius: var(--r-sm); }
.sg-x:hover { background: var(--hover-fundo); color: var(--txt); border-color: var(--hover-borda); }
.sg-abas { display: flex; gap: var(--sp-1); padding: var(--sp-2) var(--sp-4) 0; border-bottom: 1px solid var(--borda);
  background: var(--cartao-alto); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.sg-aba { border: 0; background: transparent; color: var(--txt2); cursor: pointer; font: inherit;
  font-size: var(--fs-sm); padding: var(--sp-3) var(--sp-4); min-height: var(--touch-min);
  border-bottom: 3px solid transparent; white-space: nowrap; }
.sg-aba:hover { color: var(--txt); background: var(--linha-hover); }
.sg-aba[aria-selected="true"] { color: var(--acento, var(--azul)); font-weight: 600;
  border-bottom-color: var(--acento, var(--azul)); }
.sg-corpo { padding: var(--sp-5); overflow-y: auto; flex: 1; }
.sg-corpo > :first-child { margin-top: 0; }
.sg-pe { display: flex; gap: var(--sp-3); justify-content: flex-end; flex-wrap: wrap;
  padding: var(--sp-4) var(--sp-5); border-top: 1px solid var(--borda); background: var(--cartao-alto); }
.sg-pe button { font: inherit; min-height: var(--touch-min); padding: 0 var(--sp-5);
  border-radius: var(--r-sm); border: 1px solid var(--borda-forte); background: var(--campo);
  color: var(--txt); cursor: pointer; }
.sg-pe button:hover { background: var(--hover-fundo); }
.sg-pe .sg-ok { background: var(--acento, var(--azul)); border-color: var(--acento, var(--azul)); color: #fff; font-weight: 600; }
.sg-pe .sg-ok:hover { filter: brightness(1.08); }
.sg-pe .sg-perigo { background: var(--vermelho); border-color: var(--vermelho); color: #fff; font-weight: 600; }
.sg-pe button[disabled] { opacity: .6; cursor: progress; }
.sg-campo { display: block; font-size: var(--fs-sm); color: var(--txt2); }
.sg-campo input, .sg-campo textarea { width: 100%; box-sizing: border-box; font: inherit; color: var(--txt);
  background: var(--campo); border: 1px solid var(--borda-forte); border-radius: var(--r-sm);
  padding: var(--sp-3); margin-top: var(--sp-2); min-height: var(--touch-min); }
.sg-campo textarea { min-height: 96px; resize: vertical; }
.sg-campo input:focus-visible, .sg-campo textarea:focus-visible { outline: 2px solid var(--acento, var(--azul)); outline-offset: 1px; }
.sg-ajuda { font-size: var(--fs-xs); color: var(--txt3); margin: var(--sp-2) 0 0; }
.sg-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--sp-3) var(--sp-5); }
.sg-par dt { font-size: var(--fs-xs); color: var(--txt3); text-transform: uppercase; letter-spacing: .04em; }
.sg-par dd { margin: 2px 0 0; font-size: var(--fs-base); }
.sg-vazio { color: var(--txt3); font-size: var(--fs-sm); }
.sg-simbolo { display: flex; gap: var(--sp-4); align-items: flex-start; }
.sg-simbolo .sg-ic { flex: none; width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; }
.sg-simbolo .sg-ic svg { width: 26px; height: 26px; }
.sg-ic.perigo { background: color-mix(in srgb, var(--vermelho) 14%, transparent); color: var(--vermelho); }
.sg-ic.aviso { background: color-mix(in srgb, #E8A33D 20%, transparent); color: #9A6410; }
.sg-ic.ok { background: color-mix(in srgb, #2E6B52 16%, transparent); color: #2E6B52; }
.sg-ic.info { background: color-mix(in srgb, var(--acento, var(--azul)) 14%, transparent); color: var(--acento, var(--azul)); }
.sg-simbolo .sg-txt p { margin: 0 0 var(--sp-2); line-height: 1.5; }
.sg-simbolo .sg-txt .sg-destaque { font-family: ui-monospace, Menlo, monospace; font-size: 1.15em; font-weight: 700;
  background: var(--cartao-alto); border: 1px dashed var(--borda-forte); border-radius: var(--r-sm); padding: var(--sp-2) var(--sp-3); display: inline-block; user-select: all; }
@media (max-width: 480px) {
  .sg-cx { width: 100vw; max-height: 100vh; height: 100vh; border-radius: 0; border: 0; }
  .sg-corpo, .sg-topo, .sg-pe { padding-left: var(--sp-4); padding-right: var(--sp-4); }
}
@media (prefers-reduced-motion: no-preference) {
  .sg-dlg[open] .sg-cx { animation: sg-entra .16s ease-out; }
  @keyframes sg-entra { from { opacity: 0; transform: translateY(8px) scale(.99); } }
}
`;

function garantirEstilo() {
  if (document.getElementById('sg-estilo')) return;
  const s = document.createElement('style');
  s.id = 'sg-estilo';
  s.textContent = CSS;
  document.head.appendChild(s);
}

let aberto = null;

export function fecharDialogo() {
  if (!aberto) return;
  const d = aberto;
  aberto = null;
  try { d.close(); } catch (e) {}
  d.remove();
}

// abas: [{ id, rotulo, render(elemento) }] — render pode ser async.
// acoes: [{ rotulo, estilo: 'ok'|'perigo'|'', ao: async () => bool|undefined }]
//        devolver false mantém o diálogo aberto (ex.: validação falhou).
// abaInicial: id da aba que abre selecionada (padrão: a primeira).
export function abrirDialogo({ titulo, subtitulo, abas = [], acoes = [], aoFechar, abaInicial }) {
  garantirEstilo();
  fecharDialogo();

  const dlg = document.createElement('dialog');
  dlg.className = 'sg-dlg';
  const cx = document.createElement('div');
  cx.className = 'sg-cx';
  cx.setAttribute('role', 'document');

  const topo = document.createElement('div');
  topo.className = 'sg-topo';
  const h = document.createElement('h2');
  h.className = 'sg-tit';
  h.textContent = titulo || '';
  if (subtitulo) {
    const p = document.createElement('p');
    p.className = 'sg-sub';
    p.textContent = subtitulo;
    h.appendChild(p);
  }
  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'sg-x';
  x.setAttribute('aria-label', 'Fechar');
  x.textContent = '×';
  x.addEventListener('click', () => fecharDialogo());
  topo.appendChild(h);
  topo.appendChild(x);
  cx.appendChild(topo);

  const corpo = document.createElement('div');
  corpo.className = 'sg-corpo';

  if (abas.length > 1) {
    const barra = document.createElement('div');
    barra.className = 'sg-abas';
    barra.setAttribute('role', 'tablist');
    const botoes = [];
    const mostrar = (i) => {
      botoes.forEach((b, k) => b.setAttribute('aria-selected', k === i ? 'true' : 'false'));
      corpo.textContent = '';
      const r = abas[i].render(corpo);
      if (r && typeof r.catch === 'function') r.catch((e) => { corpo.textContent = String(e && e.message || e); });
    };
    abas.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sg-aba';
      b.setAttribute('role', 'tab');
      b.textContent = a.rotulo;
      b.addEventListener('click', () => mostrar(i));
      botoes.push(b);
      barra.appendChild(b);
    });
    // Setas entre abas: mesma regra de teclado das abas do hub (D73).
    barra.addEventListener('keydown', (ev) => {
      const atual = botoes.findIndex(b => b.getAttribute('aria-selected') === 'true');
      const passo = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (!passo) return;
      ev.preventDefault();
      const prox = (atual + passo + botoes.length) % botoes.length;
      mostrar(prox);
      botoes[prox].focus();
    });
    cx.appendChild(barra);
    cx.appendChild(corpo);
    mostrar(Math.max(0, abas.findIndex(a => a.id === abaInicial)));
  } else {
    cx.appendChild(corpo);
    if (abas.length === 1) {
      const r = abas[0].render(corpo);
      if (r && typeof r.catch === 'function') r.catch((e) => { corpo.textContent = String(e && e.message || e); });
    }
  }

  if (acoes.length) {
    const pe = document.createElement('div');
    pe.className = 'sg-pe';
    acoes.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.estilo === 'ok' ? 'sg-ok' : a.estilo === 'perigo' ? 'sg-perigo' : '';
      b.textContent = a.rotulo;
      b.addEventListener('click', async () => {
        if (!a.ao) { fecharDialogo(); return; }
        const texto = b.textContent;
        b.disabled = true;
        b.textContent = a.ocupado || 'Salvando…';
        try {
          const manter = await a.ao();
          if (manter !== false) fecharDialogo();
        } finally {
          b.disabled = false;
          b.textContent = texto;
        }
      });
      pe.appendChild(b);
    });
    cx.appendChild(pe);
  }

  dlg.appendChild(cx);
  // Clique fora fecha: o <dialog> recebe o clique do backdrop, a caixa não.
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) fecharDialogo(); });
  // O evento 'close' chega DEPOIS (tarefa assíncrona): se outro diálogo já abriu no lugar
  // (ficha -> editar -> ficha), não pode zerar a referência dele (D116).
  dlg.addEventListener('close', () => { if (aberto === dlg) aberto = null; dlg.remove(); if (aoFechar) aoFechar(); });
  document.body.appendChild(dlg);
  aberto = dlg;
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', 'open');
  return dlg;
}

// No lugar de window.prompt. Devolve o texto, ou null se a pessoa desistir.
export function perguntar({ titulo, rotulo, valor = '', placeholder = '', ajuda = '', multilinha = false, confirmar: rotuloOk = 'Salvar' }) {
  return new Promise((resolve) => {
    let campo;
    let respondido = false;
    abrirDialogo({
      titulo,
      abas: [{
        id: 'campo',
        rotulo: '',
        render: (el) => {
          const lab = document.createElement('label');
          lab.className = 'sg-campo';
          lab.textContent = rotulo || '';
          campo = document.createElement(multilinha ? 'textarea' : 'input');
          campo.value = valor || '';
          if (placeholder) campo.placeholder = placeholder;
          lab.appendChild(campo);
          el.appendChild(lab);
          if (ajuda) {
            const p = document.createElement('p');
            p.className = 'sg-ajuda';
            p.textContent = ajuda;
            el.appendChild(p);
          }
          if (!multilinha) {
            campo.addEventListener('keydown', (ev) => {
              if (ev.key === 'Enter') { ev.preventDefault(); respondido = true; resolve(campo.value); fecharDialogo(); }
            });
          }
          setTimeout(() => { campo.focus(); campo.select && campo.select(); }, 0);
        }
      }],
      acoes: [
        { rotulo: 'Cancelar' },
        { rotulo: rotuloOk, estilo: 'ok', ao: () => { respondido = true; resolve(campo.value); } }
      ],
      aoFechar: () => { if (!respondido) resolve(null); }
    });
  });
}

// Símbolo ao lado do texto (como no SIGMA v2): perigo | aviso | ok | info.
const ICONES = {
  perigo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4.5M12 17.5h.01"/></svg>',
  aviso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16.2 9"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/></svg>'
};

// Texto com símbolo. Linha começando com "»" vira destaque copiável (ex.: senha temporária).
function renderTexto(el, texto, icone) {
  const box = document.createElement('div');
  box.className = icone ? 'sg-simbolo' : '';
  if (icone && ICONES[icone]) {
    const ic = document.createElement('div');
    ic.className = 'sg-ic ' + icone;
    ic.innerHTML = ICONES[icone];
    box.appendChild(ic);
  }
  const txt = document.createElement('div');
  txt.className = 'sg-txt';
  String(texto || '').split('\n').forEach(linha => {
    const p = document.createElement('p');
    if (linha.startsWith('»')) {
      const b = document.createElement('span');
      b.className = 'sg-destaque';
      b.textContent = linha.replace(/^»\s*/, '');
      p.appendChild(b);
    } else p.textContent = linha;
    txt.appendChild(p);
  });
  box.appendChild(txt);
  el.appendChild(box);
}

// No lugar de window.alert. Devolve promessa resolvida quando fecha.
export function avisar({ titulo, texto, icone = 'info', ok: rotuloOk = 'Entendi' }) {
  return new Promise((resolve) => {
    abrirDialogo({
      titulo,
      abas: [{ id: 'texto', rotulo: '', render: (el) => renderTexto(el, texto, icone) }],
      acoes: [{ rotulo: rotuloOk, estilo: 'ok' }],
      aoFechar: () => resolve(true)
    });
  });
}

// No lugar de window.confirm. `perigo: true` pinta o botão de vermelho e usa o símbolo de perigo.
export function confirmar({ titulo, texto, confirmar: rotuloOk = 'Confirmar', cancelar = 'Cancelar', perigo = false, icone }) {
  return new Promise((resolve) => {
    let respondido = false;
    abrirDialogo({
      titulo,
      abas: [{
        id: 'texto', rotulo: '',
        render: (el) => renderTexto(el, texto, icone || (perigo ? 'perigo' : 'aviso'))
      }],
      acoes: [
        { rotulo: cancelar },
        { rotulo: rotuloOk, estilo: perigo ? 'perigo' : 'ok', ao: () => { respondido = true; resolve(true); } }
      ],
      aoFechar: () => { if (!respondido) resolve(false); }
    });
  });
}
