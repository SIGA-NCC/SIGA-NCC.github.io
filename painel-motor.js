// D117/D118/D119 — MOTOR dos painéis interativos. REGRA (D119): todo gráfico do SIGMA sai daqui
// (ou de grafico-mini.js) — interativo, responsivo, configurável pelo ADM, com tabela e animação leve.
// Um painel = { painel: 'ncc', raiz, aoCarregar(r, ctx), blocosExtras(ctx) }.
// O servidor manda a FONTE (dimensões, medidas) + linhas compactas; a lógica pura está em painel-dados.js.
// Portado do SIGMA-MRO (sandbox-gas/front-delta) para o SIGA-NCC: sem query de versão nos imports.
import { chamarAutenticado } from './auth.js';
import { abrirDialogo, fecharDialogo } from './sigma-dialogo.js';
import { decodificar, filtrar, filtroFixo, agrupar, reincidentes, rotuloValor, periodoDe, periodoAnterior, fichaTrem, ficha,
  usarFonte, serieCompleta, diasDoPeriodo, pareto, matriz, controle, kpisDe, variacao, situacaoMeta, formatar, valorMedida,
  ROTULO_DIM, DIMENSOES, DIMS_TEMPO } from './painel-dados.js';

const $ = (id) => document.getElementById(id);
export const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, at) => { const e = document.createElementNS(SVG, tag); Object.entries(at || {}).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
export const num = (n) => Number(n || 0).toLocaleString('pt-BR');
const dataBR = (d) => (d ? d.split('-').reverse().join('/') : '—');
// Paleta categórica (contraste ok em claro e escuro) + cinza para "Outros".
export const CORES = ['#2E6B52', '#C45D3C', '#E8A33D', '#2F6FDB', '#7B5CC4', '#1F9AA8', '#B7A11B', '#8A6A4F'];
const CINZA = '#9AA5B1';
const CHAVES_R = { trem_sistema: 'mesmo trem e sistema', trem_falha: 'mesmo trem e falha', trem_sistema_falha: 'mesmo trem, sistema e falha' };
const TIPOS = { barras: 'Barras', pizza: 'Pizza', linha: 'Linha do tempo', pareto: 'Pareto (80/20)', mapa: 'Mapa de calor', controle: 'Gráfico de controle' };
// Animação só se o aparelho não pediu movimento reduzido.
const calmo = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
// Colunas do histórico da ficha, por fonte.
const COLS_FICHA = {
  registros: [['d', 'Data'], ['sistema', 'Sistema'], ['falha', 'Falha'], ['status', 'Situação'], ['usuario', 'Técnico']],
  lab: [['d', 'Aberta'], ['num', 'Nº'], ['equipamento', 'Equipamento'], ['situacao', 'Situação'], ['conclusao', 'Conclusão'], ['dias', 'Dias']],
  hh: [['d', 'Data'], ['ordem', 'Ordem'], ['trem', 'Trem'], ['atividade', 'Atividade'], ['hh', 'HH']],
  ncc: [['d', 'Data'], ['tipo', 'Tipo'], ['produto', 'Produto'], ['qtd', 'Qtd'], ['unidade', 'Unidade'], ['quem', 'Quem registrou']],
};

function esqueleto(raiz) {
  raiz.innerHTML = `
  <div class="barra-topo">
    <label>Período
      <select id="preset"><option value="30">Últimos 30 dias</option><option value="90" selected>Últimos 90 dias</option><option value="365">Últimos 12 meses</option><option value="0">Tudo</option><option value="x">Escolher datas…</option></select></label>
    <label id="l-desde" hidden>De <input type="date" id="desde"></label>
    <label id="l-ate" hidden>Até <input type="date" id="ate"></label>
    <label class="chk" id="l-tecnicos" hidden><input type="checkbox" id="tecnicos" checked> Só registros técnicos</label>
    <label>Atualizar
      <select id="auto"><option value="0">Manual</option><option value="5">A cada 5 min (TV)</option></select></label>
    <button class="btn" id="b-atualizar" type="button">Atualizar agora</button>
    <button class="btn" id="b-config" type="button" hidden>⚙️ Configurar painel</button>
  </div>
  <div class="filtros" id="filtros"></div>
  <p class="estado" id="estado" role="status" aria-live="polite">Carregando…</p>
  <div class="kpis" id="kpis"></div>
  <div id="extras"></div>
  <div class="grade" id="grade"></div>`;
}

export function iniciarPainel(opts) {
  const raiz = typeof opts.raiz === 'string' ? $(opts.raiz) : (opts.raiz || $('painel-raiz'));
  if (raiz) esqueleto(raiz);
  const P = { painel: opts.painel || 'frota', LINHAS: [], CONFIG: null, FONTE: null, ADMIN: false, relogio: null,
    FILTRO: { cruzados: {} }, reinc: { opcao: 'painel', desde: '', ate: '' },
    largura: {}, kpiAntes: {}, chipsAntes: new Set(), entrada: true, tabela: {} };
  const medidaDe = (g) => { const ms = (P.FONTE && P.FONTE.medidas) || [{ id: 'qtd', agg: 'contagem' }]; return ms.find(m => m.id === (g && g.medida)) || ms[0]; };
  const fmtMed = (m, v) => (m && m.agg !== 'contagem' ? formatar(v, 'dec') : num(v));

  // ------------------------------------------------------------ período e filtros
  function periodo() {
    const p = $('preset').value;
    if (p === 'x') return { desde: $('desde').value, ate: $('ate').value };
    if (p === '0') return {};
    return { desde: new Date(Date.now() - Number(p) * 864e5).toISOString().slice(0, 10) };
  }
  const usaTecnicos = () => !!(P.FONTE && P.FONTE.tecnicos);
  const filtroAtual = (extra) => Object.assign({}, P.FILTRO, periodo(), { tecnicos: usaTecnicos() && $('tecnicos').checked }, extra || {});

  function alternar(dim, valor) {
    if (!valor || valor === 'Outros') return;
    if (P.FILTRO.cruzados[dim] === valor) delete P.FILTRO.cruzados[dim]; else P.FILTRO.cruzados[dim] = valor;
    pintar();
  }

  function pintarFiltros() {
    const f = $('filtros'); f.textContent = '';
    const ks = Object.keys(P.FILTRO.cruzados);
    const agora = new Set(ks.map(k => k + '=' + P.FILTRO.cruzados[k]));
    if (!ks.length) { f.appendChild(el('span', 'fdica', 'Nenhum filtro: toque num gráfico para filtrar.')); P.chipsAntes = agora; return; }
    ks.forEach(dim => {
      const novo = !P.chipsAntes.has(dim + '=' + P.FILTRO.cruzados[dim]);
      const b = el('button', 'fchip' + (novo && !calmo() ? ' pn-pop' : '')); b.type = 'button'; b.setAttribute('aria-label', 'Tirar filtro ' + (ROTULO_DIM[dim] || dim));
      b.append(document.createTextNode((ROTULO_DIM[dim] || dim) + ': '), el('b', null, rotuloValor(dim, P.FILTRO.cruzados[dim])), document.createTextNode(' ×'));
      b.addEventListener('click', () => { delete P.FILTRO.cruzados[dim]; pintar(); });
      f.appendChild(b);
    });
    P.chipsAntes = agora;
    // D118: valor da dimensão da ficha filtrado -> atalho para a ficha (trem, pessoa…).
    const fd = P.FONTE && P.FONTE.ficha && P.FONTE.ficha.dim;
    if (fd && P.FILTRO.cruzados[fd]) {
      const fi = el('button', 'btn pn-ficha-btn', '📄 Ficha: ' + P.FILTRO.cruzados[fd]); fi.type = 'button';
      fi.addEventListener('click', () => abrirFicha(P.FILTRO.cruzados[fd]));
      f.appendChild(fi);
    }
    const limpar = el('button', 'btn', 'Limpar filtros'); limpar.type = 'button';
    limpar.addEventListener('click', () => { P.FILTRO.cruzados = {}; pintar(); });
    f.appendChild(limpar);
  }

  // ------------------------------------------------------------ animação: barras transitam da largura antiga para a nova
  const pendentes = [];
  function animarLargura(fill, chave, pct) {
    const antes = P.largura[chave];
    P.largura[chave] = pct;
    if (calmo()) { fill.style.width = pct + '%'; return; }
    fill.style.width = (antes == null ? 0 : antes) + '%';
    pendentes.push(() => { fill.style.width = pct + '%'; });
  }
  function rodarPendentes() {
    if (!pendentes.length) return;
    const lote = pendentes.splice(0);
    requestAnimationFrame(() => requestAnimationFrame(() => lote.forEach(f => f())));
  }

  // ------------------------------------------------------------ gráficos
  function grBarras(alvo, dim, itens, cor, g, extraCol) {
    const m = medidaDe(g);
    const maior = Math.max(1e-9, ...itens.map(i => i.qtd));
    const sel = P.FILTRO.cruzados[dim];
    itens.forEach((i, k) => {
      const b = el('button', 'hb' + (sel === i.chave ? ' sel' : sel && !i.outros ? ' apagado' : '') + (i.outros ? ' outros' : '') + (i.vital ? ' vital' : '') + (extraCol ? ' com-ac' : ''));
      b.type = 'button'; b.disabled = !!i.outros; b.title = `${rotuloValor(dim, i.chave)}: ${fmtMed(m, i.qtd)}`;
      const t = el('span', 't'); const fill = el('i');
      if (!i.outros) fill.style.background = cor; t.appendChild(fill);
      animarLargura(fill, (g ? g.id : dim) + '|' + i.chave, Math.max(1, i.qtd / maior * 100));
      b.append(el('span', 'r', rotuloValor(dim, i.chave)), t, el('span', 'v', fmtMed(m, i.qtd)));
      if (extraCol) b.appendChild(el('span', 'ac', extraCol(i)));
      b.addEventListener('click', () => alternar(dim, i.chave));
      alvo.appendChild(b);
      if (g && g.tipo === 'pareto' && i.vital && itens[k + 1] && !itens[k + 1].vital) alvo.appendChild(el('div', 'pn-corte', '— 80 % do total acima desta linha —'));
    });
  }

  function grPizza(alvo, dim, itens, cor, g) {
    const m = medidaDe(g);
    const total = itens.reduce((s, i) => s + i.qtd, 0) || 1;
    const sel = P.FILTRO.cruzados[dim];
    const paleta = [cor].concat(CORES.filter(c => c !== cor));
    const corDe = (i, k) => (i.outros ? CINZA : paleta[k % paleta.length]);
    const box = el('div', 'pz');
    const s = svg('svg', { viewBox: '-1.05 -1.05 2.1 2.1', width: 160, height: 160, role: 'img', 'aria-label': 'Gráfico de pizza' });
    if (P.entrada && !calmo()) s.classList.add('pn-gira');
    let ang = -Math.PI / 2;
    itens.forEach((i, k) => {
      const a = i.qtd / total * Math.PI * 2;
      const x1 = Math.cos(ang), y1 = Math.sin(ang), x2 = Math.cos(ang + a), y2 = Math.sin(ang + a);
      const d = a >= Math.PI * 2 - 1e-6 ? 'M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0 Z'
        : `M 0 0 L ${x1} ${y1} A 1 1 0 ${a > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
      const p = svg('path', { d, fill: corDe(i, k) }); if (sel && sel !== i.chave) p.setAttribute('class', 'apagado');
      const tt = svg('title'); tt.textContent = `${rotuloValor(dim, i.chave)}: ${fmtMed(m, i.qtd)} (${Math.round(i.qtd / total * 100)}%)`; p.appendChild(tt);
      p.addEventListener('click', () => alternar(dim, i.chave));
      s.appendChild(p); ang += a;
    });
    s.appendChild(svg('circle', { cx: 0, cy: 0, r: 0.55, class: 'furo' }));
    const centro = svg('text', { x: 0, y: 0.08, 'text-anchor': 'middle', class: 'pz-total' }); centro.textContent = fmtMed(m, Math.round(total * 10) / 10); s.appendChild(centro);
    const leg = el('div', 'leg');
    itens.forEach((i, k) => {
      const b = el('button', sel === i.chave ? 'sel' : ''); b.type = 'button';
      const q = el('i'); q.style.background = corDe(i, k);
      b.append(q, el('span', null, rotuloValor(dim, i.chave)), el('b', null, `${fmtMed(m, i.qtd)} · ${Math.round(i.qtd / total * 100)}%`));
      b.addEventListener('click', () => alternar(dim, i.chave));
      leg.appendChild(b);
    });
    box.append(s, leg); alvo.appendChild(box);
  }

  // Linha do tempo; com `ctl` (gráfico de controle) desenha média e limite, e pinta de vermelho o que passou.
  function grLinha(alvo, dim, itens, cor, g, ctl) {
    const m = medidaDe(g);
    const box = el('div', 'ln');
    // Desenha na largura REAL da grade (no celular, 600 esticado espremia o texto do eixo).
    // D138: altura acompanha a largura (cartão largo no PC/TV ganha respiro); viewBox e CSS com a MESMA altura
    // para o texto do eixo não esticar.
    const W = Math.max(300, Math.min(1400, (($('grade') && $('grade').clientWidth) || 624) - 24));
    const H = W >= 900 ? 270 : W >= 600 ? 240 : 210, M = { l: 42, r: 10, t: 14, b: 30 };
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': ctl ? 'Gráfico de controle' : 'Gráfico de linha' });
    s.style.height = H + 'px';
    const maior = Math.max(1e-9, ...itens.map(i => i.qtd), ctl ? ctl.lsc : 0);
    const x = (k) => M.l + (itens.length <= 1 ? (W - M.l - M.r) / 2 : k * (W - M.l - M.r) / (itens.length - 1));
    const y = (v) => H - M.b - v / maior * (H - M.t - M.b);
    [0, 0.5, 1].forEach(f => { const yy = y(maior * f); s.appendChild(svg('line', { x1: M.l, x2: W - M.r, y1: yy, y2: yy, class: 'grade-l' }));
      const t = svg('text', { x: 2, y: yy + 3 }); t.textContent = fmtMed(m, Math.round(maior * f * 10) / 10); s.appendChild(t); });
    if (ctl) {
      [['media', ctl.media, 'média'], ['lsc', ctl.lsc, 'limite']].forEach(([cls, v, rot]) => {
        s.appendChild(svg('line', { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: 'ctl-' + cls, 'vector-effect': 'non-scaling-stroke' }));
        const t = svg('text', { x: W - M.r, y: y(v) - 3, 'text-anchor': 'end', class: 'ctl-t' }); t.textContent = `${rot} ${formatar(v, 'dec')}`; s.appendChild(t);
      });
    }
    const linha = svg('polyline', { points: itens.map((i, k) => `${x(k)},${y(i.qtd)}`).join(' '), fill: 'none', stroke: cor, 'stroke-width': 2.5, 'vector-effect': 'non-scaling-stroke', pathLength: 1 });
    if (P.entrada && !calmo()) linha.classList.add('pn-desenha');
    s.appendChild(linha);
    const passo = Math.max(1, Math.ceil(itens.length / Math.max(3, Math.floor(W / 70))));
    const sel = P.FILTRO.cruzados[dim];
    const pts = ctl ? ctl.pontos : itens;
    pts.forEach((i, k) => {
      const fora = ctl && i.fora;
      const c = svg('circle', { cx: x(k), cy: y(i.qtd), r: sel === i.chave ? 6 : fora ? 5.5 : 4.5, fill: fora ? 'var(--vermelho, #D1242F)' : cor });
      if (sel === i.chave) c.setAttribute('class', 'sel');
      const tt = svg('title'); tt.textContent = `${rotuloValor(dim, i.chave)}: ${fmtMed(m, i.qtd)}${fora ? ' — acima do limite' : ''}`; c.appendChild(tt);
      c.addEventListener('click', () => alternar(dim, i.chave));
      s.appendChild(c);
      if (k % passo === 0) { const t = svg('text', { x: x(k), y: H - 8, 'text-anchor': k === 0 ? 'start' : k === pts.length - 1 ? 'end' : 'middle' }); t.textContent = rotuloValor(dim, i.chave); s.appendChild(t); }
    });
    box.appendChild(s); alvo.appendChild(box);
    if (ctl) {
      const fora = ctl.pontos.filter(p => p.fora);
      alvo.appendChild(el('p', 'nota', fora.length ? `⚠️ ${fora.length} período(s) acima do limite (média + 2 desvios): ${fora.slice(-4).map(p => rotuloValor(dim, p.chave)).join(', ')}. Toque no ponto para ver o que houve.` : 'Tudo dentro do normal neste período.'));
    }
  }

  // Mapa de calor d1 × d2: tocar na célula filtra as duas dimensões; no cabeçalho, só uma.
  function grMapa(alvo, g, linhas, cor) {
    const m = medidaDe(g);
    const mz = matriz(linhas, g.dimensao, g.dimensao2, g.top || 12, 8, m);
    if (!mz.linhas.length || !mz.colunas.length) { alvo.appendChild(el('p', 'vazio', 'Sem dados para o mapa.')); return; }
    const w = el('div', 'tabwrap'); const t = el('table', 'pn-mapa');
    const s1 = P.FILTRO.cruzados[g.dimensao], s2 = P.FILTRO.cruzados[g.dimensao2];
    const th = el('tr'); th.appendChild(el('th', null, ''));
    mz.colunas.forEach(c => { const h = el('th', 'clic' + (s2 === c ? ' sel' : ''), rotuloValor(g.dimensao2, c)); h.title = 'Filtrar ' + c; h.addEventListener('click', () => alternar(g.dimensao2, c)); th.appendChild(h); });
    const thead = el('thead'); thead.appendChild(th); t.appendChild(thead);
    const tb = el('tbody');
    mz.linhas.forEach(l => {
      const tr = el('tr'); const h = el('th', 'clic' + (s1 === l ? ' sel' : ''), rotuloValor(g.dimensao, l)); h.addEventListener('click', () => alternar(g.dimensao, l)); tr.appendChild(h);
      mz.colunas.forEach(c => {
        const v = mz.cel[l + '|' + c] || 0; const td = el('td', 'clic' + (s1 === l && s2 === c ? ' sel' : ''));
        const a = mz.max ? v / mz.max : 0;
        td.style.background = v ? `color-mix(in srgb, ${cor} ${Math.round(12 + a * 78)}%, transparent)` : '';
        if (a > 0.55) td.style.color = '#fff';
        td.textContent = v ? fmtMed(m, v) : '';
        td.title = `${rotuloValor(g.dimensao, l)} × ${rotuloValor(g.dimensao2, c)}: ${fmtMed(m, v)}`;
        td.addEventListener('click', () => { P.FILTRO.cruzados[g.dimensao] = l; P.FILTRO.cruzados[g.dimensao2] = c; pintar(); });
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); w.appendChild(t); alvo.appendChild(w);
  }

  // "Ver como tabela" (regra D119: todo gráfico tem a versão em tabela; linhas também filtram).
  function tabelaItens(alvo, dim, itens, g) {
    const m = medidaDe(g);
    const total = itens.reduce((s, i) => s + i.qtd, 0) || 1;
    const w = el('div', 'tabwrap'); const t = el('table');
    const hr = el('tr'); [ROTULO_DIM[dim] || dim, m.rotulo || 'Qtd', g.tipo === 'pareto' ? '% acumulado' : '%'].forEach(x => hr.appendChild(el('th', null, x)));
    const th = el('thead'); th.appendChild(hr); t.appendChild(th);
    const tb = el('tbody');
    itens.forEach(i => { const tr = el('tr', i.outros ? '' : 'clic' + (P.FILTRO.cruzados[dim] === i.chave ? ' sel' : ''));
      const pct = g.tipo === 'pareto' ? formatar(i.acumulado, 'pct') : m.agg === 'media' ? '—' : formatar(Math.round(i.qtd / total * 1000) / 10, 'pct');
      tr.append(el('td', null, rotuloValor(dim, i.chave)), el('td', null, fmtMed(m, i.qtd)), el('td', null, pct));
      if (!i.outros) tr.addEventListener('click', () => alternar(dim, i.chave)); tb.appendChild(tr); });
    t.appendChild(tb); w.appendChild(t); alvo.appendChild(w);
  }

  function cartaoGrafico(g, i) {
    const largo = ['linha', 'controle', 'mapa'].includes(g.tipo);
    const c = el('section', 'cg' + (largo ? ' largo' : '') + (P.entrada && !calmo() ? ' pn-entra' : ''));
    c.style.setProperty('--i', i);
    const topo = el('div', 'cg-topo');
    topo.appendChild(el('h2', null, g.titulo));
    const bts = el('div', 'cg-bts');
    if (g.tipo !== 'mapa') {
      const tb = el('button', 'cg-eng' + (P.tabela[g.id] ? ' on' : ''), '▦'); tb.type = 'button'; tb.title = P.tabela[g.id] ? 'Ver como gráfico' : 'Ver como tabela';
      tb.setAttribute('aria-label', tb.title + ': ' + g.titulo); tb.setAttribute('aria-pressed', P.tabela[g.id] ? 'true' : 'false');
      tb.addEventListener('click', () => { P.tabela[g.id] = !P.tabela[g.id]; pintar(); });
      bts.appendChild(tb);
    }
    if (P.ADMIN) {
      const eng = el('button', 'cg-eng', '⚙️'); eng.type = 'button'; eng.title = 'Configurar este gráfico'; eng.setAttribute('aria-label', 'Configurar ' + g.titulo);
      eng.addEventListener('click', () => abrirConfigGrafico(i));
      bts.appendChild(eng);
    }
    topo.appendChild(bts); c.appendChild(topo);
    const m = medidaDe(g);
    const nota = [(ROTULO_DIM[g.dimensao] || g.dimensao) + (g.tipo === 'mapa' ? ' × ' + (ROTULO_DIM[g.dimensao2] || g.dimensao2) : '')];
    if ((P.FONTE.medidas || []).length > 1) nota.push(m.rotulo);
    if (g.filtro) nota.push(`só ${(ROTULO_DIM[g.filtro.campo] || g.filtro.campo).toLowerCase()} com "${g.filtro.valor}"`);
    c.appendChild(el('p', 'nota', nota.join(' · ')));
    // Filtro cruzado: o gráfico NÃO se filtra pela própria dimensão (mostra o todo, com o escolhido em destaque).
    let linhas;
    if (g.tipo === 'mapa') {
      const cz = Object.assign({}, P.FILTRO.cruzados); delete cz[g.dimensao]; delete cz[g.dimensao2];
      linhas = filtroFixo(filtrar(P.LINHAS, filtroAtual({ cruzados: cz })), g.filtro);
    } else linhas = filtroFixo(filtrar(P.LINHAS, filtroAtual(), g.dimensao), g.filtro);
    const cor = g.cor || CORES[i % CORES.length];
    if (g.tipo === 'mapa') { grMapa(c, g, linhas, cor); return c; }
    const tempo = ['linha', 'controle'].includes(g.tipo);
    let itens = agrupar(linhas, g.dimensao, tempo ? 0 : (g.top || (g.tipo === 'pizza' ? 6 : 12)), m);
    if (tempo) itens = serieCompleta(itens, g.dimensao, m);
    if (!itens.length) { c.appendChild(el('p', 'vazio', 'Sem registros com esse filtro.')); return c; }
    if (P.tabela[g.id]) { tabelaItens(c, g.dimensao, g.tipo === 'pareto' ? pareto(itens) : itens, g); return c; }
    if (g.tipo === 'pizza') grPizza(c, g.dimensao, itens, cor, g);
    else if (g.tipo === 'linha') grLinha(c, g.dimensao, itens, cor, g);
    else if (g.tipo === 'controle') grLinha(c, g.dimensao, itens, cor, g, controle(itens));
    else if (g.tipo === 'pareto') grBarras(c, g.dimensao, pareto(itens), cor, g, (x) => formatar(x.acumulado, 'pct'));
    else grBarras(c, g.dimensao, itens, cor, g);
    return c;
  }

  // ------------------------------------------------------------ reincidência (período próprio, D118) — só fonte "registros"
  function cartaoReincidencia() {
    const r = P.CONFIG.reincidencia;
    const c = el('section', 'cg largo' + (P.entrada && !calmo() ? ' pn-entra' : ''));
    c.style.setProperty('--i', P.CONFIG.graficos.length);
    c.appendChild(el('h2', null, 'Reincidentes'));
    c.appendChild(el('p', 'nota', `${r.vezes} vezes ou mais em ${r.dias} dias, ${CHAVES_R[r.chave]} (regra do ADM). Toque no trem para abrir a ficha.`));
    const barra = el('div', 'pn-rper');
    const sel = el('select'); sel.setAttribute('aria-label', 'Período da reincidência');
    [['painel', 'Mesmo período do painel'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias'], ['365', 'Últimos 12 meses'], ['0', 'Tudo'], ['x', 'Escolher datas…']]
      .forEach(([v, t]) => sel.add(new Option(t, v)));
    sel.value = P.reinc.opcao;
    const de = el('input'); de.type = 'date'; de.value = P.reinc.desde; de.setAttribute('aria-label', 'De');
    const ate = el('input'); ate.type = 'date'; ate.value = P.reinc.ate; ate.setAttribute('aria-label', 'Até');
    de.hidden = ate.hidden = P.reinc.opcao !== 'x';
    sel.addEventListener('change', () => { P.reinc.opcao = sel.value; pintar(); });
    de.addEventListener('change', () => { P.reinc.desde = de.value; pintar(); });
    ate.addEventListener('change', () => { P.reinc.ate = ate.value; pintar(); });
    barra.append(el('span', 'nota', 'Período:'), sel, de, ate);
    c.appendChild(barra);
    const per = periodoDe(P.reinc.opcao, P.reinc.desde, P.reinc.ate, periodo());
    const linhas = filtrar(P.LINHAS, Object.assign({}, P.FILTRO, per, { tecnicos: true }));
    const lst = reincidentes(linhas, r);
    if (!lst.length) { c.appendChild(el('p', 'vazio', 'Nenhum reincidente nesse período e filtro. 👍')); return { c, n: 0 }; }
    const w = el('div', 'tabwrap'); const t = el('table');
    t.innerHTML = '<thead><tr><th></th><th>Trem</th><th>Sistema</th><th>Falha</th><th>Na janela</th><th>Total</th><th>Intervalo médio</th><th>Última</th></tr></thead>';
    const tb = el('tbody');
    lst.slice(0, 50).forEach(x => {
      const tr = el('tr', 'clic'); tr.title = 'Abrir a ficha do ' + x.trem;
      const tg = el('td'); tg.appendChild(el('span', 'tag-r', 'Reincidente'));
      const sv = el('td'); if (x.severidade.nivel) sv.appendChild(el('span', 'sev ' + x.severidade.nivel, `${String(x.intervalo_medio).replace('.', ',')} d · ${x.severidade.rotulo}`)); else sv.textContent = '—';
      tr.append(tg, el('td', null, x.trem), el('td', null, x.sistema), el('td', null, x.falha || '—'), el('td', null, String(x.vezes_janela)),
        el('td', null, String(x.total)), sv, el('td', null, dataBR(x.ultima)));
      tr.addEventListener('click', () => abrirFicha(x.trem));
      tb.appendChild(tr);
    });
    t.appendChild(tb); w.appendChild(t); c.appendChild(w);
    return { c, n: lst.length };
  }

  // ------------------------------------------------------------ ficha (diálogo, D118; genérica D119)
  function barrasSoLeitura(itens, m) {
    const sb = el('div', 'pn-so-leitura');
    grBarras(sb, 'ficha', itens, CORES[0], { id: 'ficha', medida: m ? m.id : undefined });
    pendentes.splice(0).forEach(f => f()); // sem animação aqui: os clones abaixo herdam a largura final
    // Só leitura: barras sem ação (nem 'disabled', que o estilo global apaga), sem foco de teclado.
    sb.querySelectorAll('.hb').forEach(b => { b.tabIndex = -1; b.replaceWith(b.cloneNode(true)); });
    return sb;
  }
  function tabelaHistorico(c, recentes) {
    if (!recentes.length) { c.appendChild(el('p', 'vazio', 'Sem registros no período.')); return; }
    const cols = COLS_FICHA[P.FONTE.id] || COLS_FICHA.registros;
    const w = el('div', 'tabwrap'); const t = el('table');
    const hr = el('tr'); cols.forEach(([, r]) => hr.appendChild(el('th', null, r))); const th = el('thead'); th.appendChild(hr); t.appendChild(th);
    const tb = el('tbody');
    recentes.forEach(l => { const tr = el('tr'); cols.forEach(([k]) => tr.appendChild(el('td', null, k === 'd' ? dataBR(l.d) : (k === 'status' && l.nt === '1' ? (l.tipo || 'não técnico') : (l[k] === '' || l[k] == null ? '—' : String(l[k])))))); tb.appendChild(tr); });
    t.appendChild(tb); w.appendChild(t); c.appendChild(w);
    c.appendChild(el('p', 'nota', 'Os 40 mais recentes no período do painel.'));
  }
  function abrirFicha(valor) {
    const per = periodo();
    const fd = P.FONTE.ficha || { dim: 'trem', resumo: 'sistema' };
    const quadro = (n, rot) => { const b = el('div', 'pn-mini'); b.append(el('b', null, n), el('span', null, rot)); return b; };
    const base = filtrar(P.LINHAS, Object.assign({}, per));
    if (P.FONTE.id === 'registros') {
      const f = fichaTrem(base, valor, P.CONFIG.reincidencia);
      return abrirDialogo({
        titulo: 'Ficha do ' + valor,
        subtitulo: `${num(f.total)} registro(s) no período do painel · ${f.primeiro ? dataBR(f.primeiro) + ' → ' + dataBR(f.ultimo) : 'sem registro'}`,
        abas: [
          { id: 'res', rotulo: 'Resumo', render: (c) => {
            const g = el('div', 'pn-minis');
            g.append(quadro(num(f.tecnicos), 'registros técnicos'), quadro(f.pct_liberado === null ? '—' : f.pct_liberado + '%', 'saíram liberados'),
              quadro(num(f.reincidencias.length), 'reincidências'), quadro(dataBR(f.ultimo), 'último registro'));
            c.appendChild(g);
            if (f.reincidencias.length) {
              c.appendChild(el('h4', null, 'Reincidências deste trem'));
              f.reincidencias.forEach(x => c.appendChild(el('p', 'pn-linha', `🔁 ${x.sistema}${x.falha ? ' — ' + x.falha : ''}: ${x.vezes_janela}x na janela, ${x.total} no total, última ${dataBR(x.ultima)} (${x.severidade.rotulo})`)));
            }
            c.appendChild(el('h4', null, 'Por sistema'));
            c.appendChild(barrasSoLeitura(f.por_sistema));
          } },
          { id: 'hist', rotulo: 'Histórico', render: (c) => { tabelaHistorico(c, f.recentes); c.appendChild(el('p', 'nota', 'Para editar um registro, use "Registros do plantão".')); } },
        ],
        acoes: [
          { rotulo: 'Filtrar o painel por este trem', estilo: 'ok', ao: () => { P.FILTRO.cruzados.trem = valor; pintar(); } },
          { rotulo: 'Fechar' },
        ],
      });
    }
    const m = (P.FONTE.medidas || [])[0];
    const f = ficha(base, fd.dim, valor, fd.resumo, m);
    const todasDoValor = base.filter(l => String(l[fd.dim] || '').split('|').includes(valor));
    abrirDialogo({
      titulo: 'Ficha: ' + valor,
      subtitulo: `${num(f.total)} linha(s) no período do painel · ${f.primeiro ? dataBR(f.primeiro) + ' → ' + dataBR(f.ultimo) : 'sem dado'}`,
      abas: [
        { id: 'res', rotulo: 'Resumo', render: (c) => {
          const g = el('div', 'pn-minis');
          kpisDe(P.FONTE.kpis, todasDoValor, {}).slice(0, 4).forEach(k => g.appendChild(quadro(formatar(k.valor, k.fmt), k.rotulo)));
          c.appendChild(g);
          c.appendChild(el('h4', null, 'Por ' + (ROTULO_DIM[fd.resumo] || fd.resumo).toLowerCase()));
          c.appendChild(barrasSoLeitura(f.por_resumo, m));
        } },
        { id: 'hist', rotulo: 'Histórico', render: (c) => tabelaHistorico(c, f.recentes) },
      ],
      acoes: [
        { rotulo: 'Filtrar o painel', estilo: 'ok', ao: () => { P.FILTRO.cruzados[fd.dim] = valor; pintar(); } },
        { rotulo: 'Fechar' },
      ],
    });
  }

  // ------------------------------------------------------------ KPIs: contagem animada, ▲▼ contra o período anterior, meta (semáforo)
  function contar(b, de, ate, fmt) {
    if (calmo() || de == null || ate == null || de === ate || typeof ate !== 'number' || typeof de !== 'number') { b.textContent = formatar(ate, fmt); return; }
    const t0 = performance.now(), dur = 550;
    const passo = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      const v = p >= 1 ? ate : de + (ate - de) * e; b.textContent = formatar(fmt === 'int' ? Math.round(v) : Math.round(v * 10) / 10, fmt);
      if (p < 1) requestAnimationFrame(passo); };
    requestAnimationFrame(passo);
  }
  function pintarKpis(todas, nReinc) {
    const k = $('kpis'); k.textContent = '';
    const per = periodo();
    const ks = kpisDe(P.FONTE.kpis, todas, { reincidentes: nReinc, dias: diasDoPeriodo(per, P.LINHAS) });
    const ant = periodoAnterior(per);
    const ksAnt = ant ? kpisDe(P.FONTE.kpis, filtrar(P.LINHAS, filtroAtual({ desde: ant.desde, ate: ant.ate })), { dias: ant.dias }) : null;
    const metas = (P.CONFIG && P.CONFIG.metas) || {};
    ks.forEach((x, i) => {
      const meta = metas[x.id]; const st = situacaoMeta(x.valor, meta);
      const b = el('div', 'kpi' + (x.alerta ? ' alerta' : '') + (st ? ' meta-' + st : ''));
      const v = el('b'); contar(v, P.kpiAntes[x.id] === undefined ? (x.fmt === 'int' || x.fmt === 'hh' ? 0 : null) : P.kpiAntes[x.id], x.valor, x.fmt); P.kpiAntes[x.id] = x.valor;
      b.append(v, el('span', null, x.rotulo));
      const va = ksAnt && !x.semComparar ? variacao(x.valor, ksAnt[i].valor, x.sentido) : null;
      if (va) { const d = el('small', 'kd ' + va.sinal, `${va.pct > 0 ? '▲' : va.pct < 0 ? '▼' : '='} ${Math.abs(va.pct)}% vs período anterior`); d.title = `Período anterior (${ant.desde.split('-').reverse().join('/')} a ${ant.ate.split('-').reverse().join('/')}): ${formatar(ksAnt[i].valor, x.fmt)}`; b.appendChild(d); }
      if (meta) b.appendChild(el('small', 'km', `meta ${meta.sentido === 'min' ? '≥' : '≤'} ${formatar(meta.valor, x.fmt)}`));
      k.appendChild(b);
    });
  }

  // ------------------------------------------------------------ desenho
  function pintar() {
    if (!P.CONFIG) return;
    pintarFiltros();
    const todas = filtrar(P.LINHAS, filtroAtual());
    const grade = $('grade'); grade.textContent = '';
    P.CONFIG.graficos.forEach((g, i) => grade.appendChild(cartaoGrafico(g, i)));
    let nReinc = null;
    if (P.FONTE.reinc && P.CONFIG.reincidencia) { const re = cartaoReincidencia(); grade.appendChild(re.c); nReinc = re.n; }
    pintarKpis(todas, nReinc);
    if (opts.blocosExtras) opts.blocosExtras({ todas, linhas: P.LINHAS, filtro: filtroAtual(), grade, el, num, alternar, abrirFicha, valorMedida });
    rodarPendentes();
    P.entrada = false;
  }

  async function carregar() {
    $('estado').classList.remove('erro'); $('estado').textContent = 'Carregando…';
    $('grade').setAttribute('aria-busy', 'true');
    try {
      const r = await chamarAutenticado({ action: 'painel_linhas', painel: P.painel }, 90000);
      if (!r.ok) throw new Error(r.error || 'falha ao carregar o painel');
      P.FONTE = r.fonte || { id: 'registros', medidas: [{ id: 'qtd', rotulo: 'Registros', agg: 'contagem' }], reinc: true, tecnicos: true, ficha: { dim: 'trem', resumo: 'sistema' }, kpis: 'registros' };
      usarFonte(P.FONTE);
      P.LINHAS = decodificar(r); P.CONFIG = r.config;
      $('l-tecnicos').hidden = !P.FONTE.tecnicos;
      $('estado').textContent = `${num(r.total)} linhas na base · atualizado ${new Date(r.gerado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      if (opts.aoCarregar) { const ex = $('extras'); ex.textContent = ''; opts.aoCarregar(r, { extras: ex, el, num, alternar, abrirFicha }); }
      pintar();
    } catch (e) { $('estado').textContent = e.message; $('estado').classList.add('erro'); }
    finally { $('grade').removeAttribute('aria-busy'); }
  }

  async function salvarConfig(cfg) {
    const r = await chamarAutenticado({ action: 'painel_config_salvar', painel: P.painel, config: JSON.stringify(cfg) });
    if (!r.ok) throw new Error(r.error || 'não salvou');
    P.CONFIG = r.config; pintar();
  }

  // ------------------------------------------------------------ configuração (ADM)
  const opcoes = (sel, vals, rot) => vals.forEach(v => sel.add(new Option(rot ? (rot[v] || v) : v, v)));

  // Formulário de UM gráfico (usado na engrenagem do gráfico e na lista geral).
  function formGrafico(g, box) {
    const campo = (rot, tag, val, set) => { const l = el('label', null, rot); const e = el(tag); if (tag === 'select') set(e); e.value = val ?? ''; l.appendChild(e); box.appendChild(l); return { l, e }; };
    const tit = campo('Nome do gráfico', 'input', g.titulo).e; tit.maxLength = 60; tit.addEventListener('input', () => { g.titulo = tit.value; });
    const tp = campo('Tipo', 'select', g.tipo, s => opcoes(s, Object.keys(TIPOS), TIPOS)).e;
    const dim = campo('Agrupar por', 'select', g.dimensao, s => opcoes(s, DIMENSOES, ROTULO_DIM)).e; dim.addEventListener('change', () => { g.dimensao = dim.value; });
    const d2 = campo('Cruzar com (mapa)', 'select', g.dimensao2 || '', s => opcoes(s, DIMENSOES, ROTULO_DIM));
    d2.e.addEventListener('change', () => { g.dimensao2 = d2.e.value; });
    const vis = () => { d2.l.hidden = tp.value !== 'mapa'; if (tp.value === 'mapa' && !g.dimensao2) { g.dimensao2 = DIMENSOES.find(d => d !== g.dimensao && !DIMS_TEMPO.includes(d)); d2.e.value = g.dimensao2; } };
    tp.addEventListener('change', () => { g.tipo = tp.value; if (g.tipo === 'controle' && !['semana', 'mes'].includes(g.dimensao)) { g.dimensao = 'semana'; dim.value = 'semana'; } vis(); });
    vis();
    const ms = P.FONTE.medidas || [];
    if (ms.length > 1) { const md = campo('Medida', 'select', g.medida || ms[0].id, s => ms.forEach(m => s.add(new Option(m.rotulo, m.id)))).e; md.addEventListener('change', () => { g.medida = md.value; }); }
    const top = campo('Mostrar (máx.)', 'input', g.top || '').e; top.type = 'number'; top.min = 3; top.max = 30; top.placeholder = 'auto'; top.addEventListener('input', () => { g.top = top.value; });
    const lc = el('label', null, 'Cor'); const cores = el('div', 'pn-cores');
    CORES.forEach(cx => { const b = el('button', 'pn-cor' + ((g.cor || '').toUpperCase() === cx ? ' sel' : '')); b.type = 'button'; b.style.background = cx; b.title = cx;
      b.addEventListener('click', () => { g.cor = cx; cores.querySelectorAll('.pn-cor').forEach(z => z.classList.toggle('sel', z === b)); }); cores.appendChild(b); });
    const livre = el('input'); livre.type = 'color'; livre.value = g.cor || CORES[0]; livre.title = 'Outra cor'; livre.addEventListener('input', () => { g.cor = livre.value; cores.querySelectorAll('.pn-cor').forEach(z => z.classList.remove('sel')); });
    cores.appendChild(livre); lc.appendChild(cores); box.appendChild(lc);
    const livres = DIMENSOES.filter(d => !DIMS_TEMPO.includes(d));
    const fc = campo('Filtro fixo: campo', 'select', g.filtro ? g.filtro.campo : '', s => { s.add(new Option('(nenhum)', '')); opcoes(s, livres, ROTULO_DIM); }).e;
    const fv = campo('contém', 'input', g.filtro ? g.filtro.valor : '').e; fv.placeholder = 'ex.: ECOPACK';
    const setF = () => { g.filtro = fc.value && fv.value.trim() ? { campo: fc.value, valor: fv.value.trim() } : undefined; };
    fc.addEventListener('change', setF); fv.addEventListener('input', setF);
  }

  const erroMsg = (msg, e) => { if (msg) { msg.className = 'cfg-msg erro'; msg.textContent = e.message || e; } return false; };

  // Engrenagem do gráfico (D118, pedido do dono: "mudar o nome, mudar cor").
  function abrirConfigGrafico(i) {
    const cfg = JSON.parse(JSON.stringify(P.CONFIG));
    const g = cfg.graficos[i];
    let msg;
    abrirDialogo({
      titulo: 'Configurar gráfico', subtitulo: g.titulo + ' — vale para todos',
      abas: [{ id: 'g', rotulo: 'Gráfico', render: (c) => { const box = el('div', 'cfg-g cfg-um'); formGrafico(g, box); c.appendChild(box); msg = el('p', 'cfg-msg'); c.appendChild(msg); } }],
      acoes: [
        { rotulo: 'Salvar', estilo: 'ok', ao: async () => { try { await salvarConfig(cfg); return true; } catch (e) { return erroMsg(msg, e); } } },
        { rotulo: 'Remover gráfico', estilo: 'perigo', ao: async () => {
          if (cfg.graficos.length <= 1) return erroMsg(msg, 'O painel precisa de pelo menos 1 gráfico.');
          cfg.graficos.splice(i, 1);
          try { await salvarConfig(cfg); return true; } catch (e) { return erroMsg(msg, e); } } },
        { rotulo: 'Cancelar' },
      ],
    });
  }

  function abrirConfig() {
    const cfg = JSON.parse(JSON.stringify(P.CONFIG));
    let lista, msg;
    const pintarLista = () => {
      lista.textContent = '';
      cfg.graficos.forEach((g, i) => {
        const box = el('div', 'cfg-g');
        formGrafico(g, box);
        const ac = el('div', 'cfg-acoes');
        [['↑', () => { if (i > 0) { [cfg.graficos[i - 1], cfg.graficos[i]] = [cfg.graficos[i], cfg.graficos[i - 1]]; pintarLista(); } }],
         ['↓', () => { if (i < cfg.graficos.length - 1) { [cfg.graficos[i + 1], cfg.graficos[i]] = [cfg.graficos[i], cfg.graficos[i + 1]]; pintarLista(); } }],
         ['Remover', () => { cfg.graficos.splice(i, 1); pintarLista(); }]].forEach(([t, fn]) => { const b = el('button', null, t); b.type = 'button'; b.addEventListener('click', fn); ac.appendChild(b); });
        box.appendChild(ac); lista.appendChild(box);
      });
    };
    const abas = [{ id: 'cfg', rotulo: 'Gráficos', render: (c) => {
      if (P.FONTE.reinc) {
        cfg.reincidencia = cfg.reincidencia || { vezes: 3, dias: 15, chave: 'trem_sistema' };
        c.appendChild(el('h4', null, 'Reincidência'));
        const r = el('div', 'cfg-r');
        const rc = (rot, tag, val, on) => { const l = el('label', null, rot); const e = el(tag); if (tag === 'select') opcoes(e, ['trem_sistema', 'trem_falha', 'trem_sistema_falha'], { trem_sistema: 'Trem + sistema', trem_falha: 'Trem + falha', trem_sistema_falha: 'Trem + sistema + falha' }); else { e.type = 'number'; } e.value = val; e.addEventListener('input', () => on(e.value)); e.addEventListener('change', () => on(e.value)); l.appendChild(e); r.appendChild(l); };
        rc('Vezes (N)', 'input', cfg.reincidencia.vezes, v => { cfg.reincidencia.vezes = v; });
        rc('Em quantos dias', 'input', cfg.reincidencia.dias, v => { cfg.reincidencia.dias = v; });
        rc('Contar por', 'select', cfg.reincidencia.chave, v => { cfg.reincidencia.chave = v; });
        c.appendChild(r);
        if (P.painel === 'frota') c.appendChild(el('p', 'nota', 'A mesma regra marca "REINCIDENTE" na Passagem de serviço.'));
      }
      c.appendChild(el('h4', null, 'Gráficos'));
      lista = el('div'); c.appendChild(lista); pintarLista();
      const add = el('button', 'btn', '+ Adicionar gráfico'); add.type = 'button';
      add.addEventListener('click', () => { cfg.graficos.push({ id: 'g' + Date.now().toString(36), titulo: 'Novo gráfico', dimensao: DIMENSOES.find(d => !DIMS_TEMPO.includes(d)), tipo: 'barras' }); pintarLista(); });
      c.appendChild(add);
      msg = el('p', 'cfg-msg'); c.appendChild(msg);
    } }];
    abrirDialogo({
      titulo: 'Configurar o painel', subtitulo: 'Vale para todos. Só o ADM muda.', abas,
      acoes: [
        { rotulo: 'Salvar para todos', estilo: 'ok', ao: async () => { try { await salvarConfig(cfg); return true; } catch (e) { return erroMsg(msg, e); } } },
        { rotulo: 'Cancelar' },
      ],
    });
  }

  // ------------------------------------------------------------ liga tudo
  $('preset').addEventListener('change', () => { const x = $('preset').value === 'x'; $('l-desde').hidden = $('l-ate').hidden = !x; pintar(); });
  ['desde', 'ate', 'tecnicos'].forEach(id => $(id).addEventListener('change', pintar));
  $('b-atualizar').addEventListener('click', carregar);
  $('b-config').addEventListener('click', abrirConfig);
  const chaveAuto = 'sigma:painel_auto_' + P.painel;
  $('auto').addEventListener('change', () => {
    clearInterval(P.relogio); P.relogio = null;
    if ($('auto').value !== '0') P.relogio = setInterval(carregar, Number($('auto').value) * 60000);
    try { localStorage.setItem(chaveAuto, $('auto').value); } catch (e) {}
  });

  return {
    comecar(usuario) {
      P.ADMIN = String((usuario && usuario.papel) || '').toUpperCase() === 'ADMIN';
      $('b-config').hidden = !P.ADMIN;
      try { const a = localStorage.getItem(chaveAuto); if (a) { $('auto').value = a; $('auto').dispatchEvent(new Event('change')); } } catch (e) {}
      carregar();
    },
    filtrar(dim, valor) { if (valor) P.FILTRO.cruzados[dim] = valor; else delete P.FILTRO.cruzados[dim]; pintar(); },
    atualizar() { return carregar(); },
    fecharDialogo,
  };
}
