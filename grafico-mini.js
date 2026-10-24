// D119 (2026-10-13) — REGRA: gráfico solto (fora de um painel) também é interativo. Barras horizontais
// que filtram a lista da própria tela ou levam ao detalhe (drill-down), com animação leve
// (desligada em prefers-reduced-motion). Substitui `barras()` de painel-gestor-render.js em tela nova.
// barrasMini(alvo, itens[{chave, qtd, rotulo?}], { sel, ao(chave), cor, unidade, total, vazio })
const CSS = `
.gm { display: grid; gap: 2px; }
.gm-b { display: grid; grid-template-columns: minmax(80px, 38%) 1fr auto; gap: 8px; align-items: center; width: 100%; border: 0; background: none;
  padding: 5px 4px; font: inherit; font-size: 13px; color: var(--txt, #1F2328); text-align: left; border-radius: 6px; cursor: pointer; }
.gm-b:hover { background: var(--sel-fundo, #EEF2F7); }
.gm-b.sel { background: var(--sel-fundo, #E3ECF8); outline: 2px solid var(--azul, #2F6FDB); }
.gm-b.apagado { opacity: .5; }
.gm-b .r { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gm-b .t { height: 14px; background: var(--campo, #F0F2F5); border-radius: 4px; overflow: hidden; }
.gm-b .t i { display: block; height: 100%; border-radius: 4px; width: 0; transition: width .45s cubic-bezier(.2,.8,.2,1); }
.gm-b .v { font-variant-numeric: tabular-nums; font-weight: 700; }
.gm-b .v small { font-weight: 400; color: var(--txt3, #6E7781); margin-left: 4px; }
.gm-dica { font-size: 12px; color: var(--txt3, #6E7781); margin: 4px 0 0; }
/* D138: com respiro — estreito: nome inteiro em cima e barra embaixo; largo (≥520 px): 3 colunas. */
.gm { container-type: inline-size; }
.gm-b { grid-template-columns: 1fr auto; grid-template-areas: "r v" "t t"; row-gap: 5px; column-gap: 10px; padding: 7px 4px; }
.gm-b .r { grid-area: r; white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.25; overflow-wrap: anywhere; }
.gm-b .t { grid-area: t; height: 10px; } .gm-b .v { grid-area: v; }
@container (min-width: 520px) {
  .gm-b { grid-template-columns: minmax(140px, 42%) 1fr auto; grid-template-areas: "r t v"; padding: 5px 4px; }
  .gm-b .t { height: 14px; }
}
@media (prefers-reduced-motion: reduce) { .gm-b .t i { transition: none; } }`;

function estilo() {
  if (typeof document === 'undefined' || document.getElementById('gm-css')) return;
  const s = document.createElement('style'); s.id = 'gm-css'; s.textContent = CSS; document.head.appendChild(s);
}

const larguras = new Map(); // animação: a barra sai da largura anterior (mesmo alvo + chave)

export function barrasMini(alvo, itens, o = {}) {
  estilo();
  alvo.textContent = '';
  const lista = (itens || []).filter(i => Number(i.qtd) > 0);
  if (!lista.length) { if (o.vazio) { const p = document.createElement('p'); p.className = 'gm-dica'; p.textContent = o.vazio; alvo.appendChild(p); } return 0; }
  const maior = Math.max(...lista.map(i => Number(i.qtd)));
  const total = o.total || lista.reduce((s, i) => s + Number(i.qtd), 0);
  const box = document.createElement('div'); box.className = 'gm';
  const pend = [];
  const idAlvo = alvo.id || 'gm';
  lista.forEach(i => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'gm-b' + (o.sel === i.chave ? ' sel' : o.sel ? ' apagado' : '');
    const pct = total ? Math.round(Number(i.qtd) / total * 1000) / 10 : 0;
    b.title = `${i.rotulo || i.chave}: ${Number(i.qtd).toLocaleString('pt-BR')} ${o.unidade || ''} (${String(pct).replace('.', ',')}%)` + (o.ao ? ' — toque para ver' : '');
    if (!o.ao) b.tabIndex = -1;
    const r = document.createElement('span'); r.className = 'r'; r.textContent = i.rotulo || i.chave;
    const t = document.createElement('span'); t.className = 't'; const fill = document.createElement('i');
    fill.style.background = o.cor || 'var(--azul, #2F6FDB)'; t.appendChild(fill);
    const v = document.createElement('span'); v.className = 'v'; v.textContent = Number(i.qtd).toLocaleString('pt-BR');
    const sm = document.createElement('small'); sm.textContent = String(pct).replace('.', ',') + '%'; v.appendChild(sm);
    b.append(r, t, v);
    if (o.ao) b.addEventListener('click', () => o.ao(i.chave, i));
    box.appendChild(b);
    const k = idAlvo + '|' + i.chave, novo = Math.max(1, Number(i.qtd) / maior * 100);
    fill.style.width = (larguras.get(k) || 0) + '%'; larguras.set(k, novo);
    pend.push(() => { fill.style.width = novo + '%'; });
  });
  alvo.appendChild(box);
  if (o.ao) { const d = document.createElement('p'); d.className = 'gm-dica'; d.textContent = o.dica || 'Toque numa barra para filtrar.'; alvo.appendChild(d); }
  requestAnimationFrame(() => requestAnimationFrame(() => pend.forEach(f => f())));
  return lista.length;
}
