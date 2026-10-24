// D117/D118/D119 — Motor dos painéis: lógica PURA (decodificar, filtrar, agrupar, medidas, reincidência,
// Pareto, mapa, gráfico de controle, KPIs). O servidor manda as linhas compactas uma vez e a
// descrição da FONTE (dimensões, medidas); todo filtro cruzado é calculado aqui.
// Portado do SIGMA-MRO (sandbox-gas/front-delta) para o SIGA-NCC: fonte "ncc" (doações/cestas).

// Rótulos padrão (fonte "registros"); `usarFonte` troca pelos da fonte do painel aberto.
export const ROTULO_DIM = { mes: 'Mês', ano: 'Ano', semana: 'Semana', dia_semana: 'Dia da semana', trem: 'Trem', sistema: 'Sistema', grupo: 'Grupo',
  turno: 'Turno', tipo: 'Tipo de atividade', status: 'Situação do trem', falha: 'Falha', usuario: 'Técnico' };
export const DIMENSOES = Object.keys(ROTULO_DIM);
export const DIMS_TEMPO = ['mes', 'ano', 'semana', 'dia_semana'];
const MULTI = new Set();
const ORDENADAS = new Set(); // dimensões com ordem natural no rótulo (ex.: faixas de idade)
const sem = (t) => String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Fonte do painel (vinda do servidor): { dims: [{id, rotulo, tempo, multi}], medidas: [{id, rotulo, agg}], ... }.
export function usarFonte(fonte) {
  if (!fonte || !Array.isArray(fonte.dims)) return;
  Object.keys(ROTULO_DIM).forEach(k => delete ROTULO_DIM[k]);
  DIMENSOES.length = 0; MULTI.clear(); ORDENADAS.clear();
  fonte.dims.forEach(d => { ROTULO_DIM[d.id] = d.rotulo; DIMENSOES.push(d.id); if (d.multi) MULTI.add(d.id); if (d.ordenada) ORDENADAS.add(d.id); });
}

export function decodificar(r) {
  const c = r.campos;
  return (r.linhas || []).map(l => { const o = {}; c.forEach((k, i) => { o[k] = r.dic[k][l[i]]; }); return o; });
}

// Semana ISO simples: segunda-feira da semana (AAAA-MM-DD).
function segunda(d) {
  const t = new Date(d + 'T12:00:00Z'); const dia = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dia);
  return t.toISOString().slice(0, 10);
}
const DIA_SEM = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function valorDim(l, dim) {
  if (dim === 'mes') return l.d ? l.d.slice(0, 7) : '';
  if (dim === 'ano') return l.d ? l.d.slice(0, 4) : '';
  if (dim === 'semana') return l.d ? segunda(l.d) : '';
  if (dim === 'dia_semana') return l.d ? String((new Date(l.d + 'T12:00:00Z').getUTCDay() + 6) % 7 + 1) : '';
  return l[dim] || '';
}
// Campo multivalorado (ex.: componentes de uma ordem, separados por "|"): a linha conta em cada valor.
export function valoresDim(l, dim) {
  const v = valorDim(l, dim);
  if (!v) return [];
  return MULTI.has(dim) ? v.split('|').filter(Boolean) : [v];
}

// f = { desde, ate, tecnicos (só técnicos), cruzados: {dim: valor} }. `ignorar` = dimensão do próprio gráfico.
export function filtrar(linhas, f = {}, ignorar) {
  const cz = f.cruzados || {};
  return linhas.filter(l => {
    if (f.desde && (!l.d || l.d < f.desde)) return false;
    if (f.ate && (!l.d || l.d > f.ate)) return false;
    if (f.tecnicos && l.nt === '1') return false;
    for (const dim in cz) {
      if (dim === ignorar) continue;
      if (MULTI.has(dim) ? valoresDim(l, dim).indexOf(cz[dim]) < 0 : valorDim(l, dim) !== cz[dim]) return false;
    }
    return true;
  });
}

// Filtro FIXO do gráfico (ADM): ex. falha contém "ECOPACK" / sistema = "FREIO". Comparação sem acento e por "contém".
export function filtroFixo(linhas, filtro) {
  if (!filtro || !filtro.campo || !filtro.valor) return linhas;
  const alvo = sem(filtro.valor);
  return linhas.filter(l => sem(l[filtro.campo]).includes(alvo));
}

// Medida: contagem (padrão), soma de um campo (HH) ou média de um campo (dias até fechar).
const acum = (m, l) => {
  if (!m || m.agg === 'contagem' || !m.agg) return [1, 1];
  const v = l[m.id];
  if (v === '' || v == null || !isFinite(Number(v))) return m.agg === 'media' ? [0, 0] : [0, 1];
  return [Number(v), 1];
};
const fecha = (m, s, n) => (m && m.agg === 'media' ? (n ? Math.round(s / n * 10) / 10 : 0) : Math.round(s * 100) / 100);
export function valorMedida(linhas, m) {
  let s = 0, n = 0; linhas.forEach(l => { const [a, b] = acum(m, l); s += a; n += b; });
  return m && m.agg === 'media' && !n ? null : fecha(m, s, n);
}

export function agrupar(linhas, dim, top, medida) {
  const S = {}, N = {};
  linhas.forEach(l => { const [a, b] = acum(medida, l); if (!b) return; valoresDim(l, dim).forEach(v => { S[v] = (S[v] || 0) + a; N[v] = (N[v] || 0) + b; }); });
  let itens = Object.keys(S).map(chave => ({ chave, qtd: fecha(medida, S[chave], N[chave]), n: N[chave] }));
  if (DIMS_TEMPO.includes(dim) || ORDENADAS.has(dim)) return itens.sort((a, b) => a.chave.localeCompare(b.chave));
  itens.sort((a, b) => b.qtd - a.qtd || a.chave.localeCompare(b.chave));
  if (top && itens.length > top) {
    const resto = itens.slice(top);
    const sr = resto.reduce((s, x) => s + (medida && medida.agg === 'media' ? x.qtd * x.n : x.qtd), 0), nr = resto.reduce((s, x) => s + x.n, 0);
    itens = itens.slice(0, top).concat(nr ? [{ chave: 'Outros', qtd: fecha(medida, sr, nr), n: nr, outros: true }] : []);
  }
  return itens;
}

// Série de tempo SEM buracos: semanas/meses sem registro entram com 0 (senão a linha "pula" o vazio).
export function serieCompleta(itens, dim, medida) {
  if (!['semana', 'mes'].includes(dim) || itens.length < 2 || (medida && medida.agg === 'media')) return itens;
  const por = {}; itens.forEach(i => { por[i.chave] = i; });
  const out = []; let k = itens[0].chave; const fim = itens[itens.length - 1].chave;
  for (let guarda = 0; k <= fim && guarda < 600; guarda++) {
    out.push(por[k] || { chave: k, qtd: 0, n: 0 });
    if (dim === 'semana') { const t = new Date(k + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + 7); k = t.toISOString().slice(0, 10); }
    else { const [a, m] = k.split('-').map(Number); k = m === 12 ? (a + 1) + '-01' : a + '-' + String(m + 1).padStart(2, '0'); }
  }
  return out;
}

// Pareto: % acumulado e quem está nos "poucos vitais" (até 80 % do total).
export function pareto(itens) {
  const total = itens.reduce((s, i) => s + i.qtd, 0) || 1;
  let ac = 0, vital = true;
  return itens.map(i => { const antes = ac; ac += i.qtd; const pct = Math.round(ac / total * 1000) / 10;
    const r = Object.assign({}, i, { acumulado: pct, vital: vital && !i.outros }); if (antes / total >= 0.8) r.vital = false; if (pct >= 80) vital = false; return r; });
}

// Mapa de calor d1 × d2 (top de cada eixo). { linhas, colunas, cel: {"a|b": v}, max }.
export function matriz(linhas, d1, d2, top1 = 12, top2 = 8, medida) {
  // Eixo de tempo: os MAIS RECENTES (agrupar devolve em ordem de data); demais: os maiores.
  const L = (DIMS_TEMPO.includes(d1) ? agrupar(linhas, d1, 0, medida).slice(-top1) : agrupar(linhas, d1, 0, medida).slice(0, top1)).map(i => i.chave);
  const C = (DIMS_TEMPO.includes(d2) ? agrupar(linhas, d2, 0, medida).slice(-top2) : agrupar(linhas, d2, 0, medida).slice(0, top2)).map(i => i.chave);
  const SL = new Set(L), SC = new Set(C), S = {}, N = {};
  linhas.forEach(l => { const [a, b] = acum(medida, l); if (!b) return;
    valoresDim(l, d1).forEach(x => { if (!SL.has(x)) return; valoresDim(l, d2).forEach(y => { if (!SC.has(y)) return; const k = x + '|' + y; S[k] = (S[k] || 0) + a; N[k] = (N[k] || 0) + b; }); }); });
  const cel = {}; let max = 0;
  Object.keys(S).forEach(k => { cel[k] = fecha(medida, S[k], N[k]); max = Math.max(max, cel[k]); });
  return { linhas: L, colunas: C, cel, max };
}

// Gráfico de controle (CEP simples): média e limites ±2σ. Pontos acima do limite = "fora do normal".
export function controle(itens) {
  const v = itens.map(i => i.qtd); const n = v.length || 1;
  const media = v.reduce((s, x) => s + x, 0) / n;
  const dp = Math.sqrt(v.reduce((s, x) => s + (x - media) ** 2, 0) / n);
  const lsc = media + 2 * dp, lic = Math.max(0, media - 2 * dp);
  return { media: Math.round(media * 10) / 10, lsc: Math.round(lsc * 10) / 10, lic: Math.round(lic * 10) / 10,
    pontos: itens.map(i => Object.assign({}, i, { fora: i.qtd > lsc && dp > 0 })) };
}

const chaveR = (l, chave) => chave === 'trem_falha' ? l.trem + '|' + l.falha : chave === 'trem_sistema_falha' ? l.trem + '|' + l.sistema + '|' + l.falha : l.trem + '|' + l.sistema;

// Reincidência (regra do ADM): a mesma chave aparece `vezes` vezes dentro de `dias` dias (janela móvel).
export function reincidentes(linhas, regra = {}) {
  const vezes = regra.vezes || 3, dias = regra.dias || 15, chave = regra.chave || 'trem_sistema';
  const grupos = {};
  linhas.forEach(l => { if (!l.trem || !l.d || l.nt === '1') return; (grupos[chaveR(l, chave)] = grupos[chaveR(l, chave)] || []).push(l); });
  const out = [];
  Object.entries(grupos).forEach(([k, ls]) => {
    if (ls.length < vezes) return;
    const datas = ls.map(l => Date.parse(l.d + 'T12:00:00Z')).sort((a, b) => a - b);
    let melhor = 0, i = 0;
    for (let j = 0; j < datas.length; j++) { while (datas[j] - datas[i] > dias * 864e5) i++; melhor = Math.max(melhor, j - i + 1); }
    if (melhor >= vezes) {
      const ult = ls.reduce((a, b) => (a.d > b.d ? a : b));
      // D118: intervalo médio entre ocorrências -> severidade (mesma régua do painel do gestor antigo).
      const media = datas.length > 1 ? Math.round((datas[datas.length - 1] - datas[0]) / 864e5 / (datas.length - 1) * 10) / 10 : null;
      out.push({ chave: k, trem: ult.trem, sistema: ult.sistema, falha: ult.falha, vezes_janela: melhor, total: ls.length, ultima: ult.d,
        intervalo_medio: media, severidade: severidade(media) });
    }
  });
  return out.sort((a, b) => b.vezes_janela - a.vezes_janela || b.ultima.localeCompare(a.ultima));
}

// Retrabalho (controle de qualidade, D119): saiu LIBERADO e o mesmo trem+sistema voltou a ter registro
// técnico em até `dias` dias. Devolve { liberados, voltaram, pct }.
export function retrabalho(linhas, dias = 3) {
  const por = {};
  linhas.forEach(l => { if (!l.trem || !l.d || l.nt === '1') return; (por[l.trem + '|' + l.sistema] = por[l.trem + '|' + l.sistema] || []).push(l); });
  let lib = 0, volta = 0;
  Object.values(por).forEach(ls => {
    ls.sort((a, b) => a.d.localeCompare(b.d));
    ls.forEach((l, i) => {
      if (l.status !== 'LIBERADO') return; lib++;
      const t = Date.parse(l.d + 'T12:00:00Z');
      for (let j = i + 1; j < ls.length; j++) { const dt = (Date.parse(ls[j].d + 'T12:00:00Z') - t) / 864e5; if (dt > dias) break; if (dt > 0) { volta++; break; } } // mesmo dia = mesma intervenção
    });
  });
  return { liberados: lib, voltaram: volta, pct: lib ? Math.round(volta / lib * 1000) / 10 : null };
}

export function rotuloValor(dim, v) {
  if (dim === 'mes' && /^\d{4}-\d{2}$/.test(v)) return v.slice(5) + '/' + v.slice(2, 4);
  if (dim === 'semana' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.slice(8) + '/' + v.slice(5, 7);
  if (dim === 'dia_semana' && /^[1-7]$/.test(v)) return DIA_SEM[Number(v) - 1];
  if (dim === 'dia_mes' && /^\d{2}$/.test(v)) return String(Number(v));
  if (dim === 'turno') return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
  return v;
}

// Severidade pelo intervalo médio entre ocorrências (dias): quanto menor, pior.
export function severidade(mediaDias) {
  if (mediaDias === null || mediaDias === undefined) return { nivel: '', rotulo: '—' };
  if (mediaDias <= 3) return { nivel: 'critico', rotulo: 'crítico' };
  if (mediaDias <= 7) return { nivel: 'serio', rotulo: 'sério' };
  if (mediaDias <= 15) return { nivel: 'atencao', rotulo: 'atenção' };
  return { nivel: 'espacado', rotulo: 'espaçado' };
}

// Período próprio de um bloco (reincidência): 'painel' | '30' | '90' | '365' | '0' (tudo) | 'x' (datas).
export function periodoDe(opcao, desde, ate, painel, hojeMs = Date.now()) {
  if (opcao === 'painel') return Object.assign({}, painel || {});
  if (opcao === 'x') return { desde: desde || '', ate: ate || '' };
  if (opcao === '0') return {};
  return { desde: new Date(hojeMs - Number(opcao) * 864e5).toISOString().slice(0, 10) };
}

// Tamanho do período em dias (para o MTBF). Sem início: do dado mais antigo até hoje.
export function diasDoPeriodo(per, linhas, hojeMs = Date.now()) {
  const hoje = new Date(hojeMs).toISOString().slice(0, 10);
  const ini = (per && per.desde) || (linhas || []).reduce((m, l) => (l.d && (!m || l.d < m) ? l.d : m), '');
  if (!ini) return null;
  const fim = (per && per.ate) || hoje;
  return Math.max(1, Math.round((Date.parse(fim + 'T12:00:00Z') - Date.parse(ini + 'T12:00:00Z')) / 864e5) + 1);
}

// Período ANTERIOR de mesmo tamanho (para o ▲▼ dos KPIs). null quando o período é "tudo".
export function periodoAnterior(per, hojeMs = Date.now()) {
  if (!per || !per.desde) return null;
  const ini = Date.parse(per.desde + 'T12:00:00Z');
  const fim = per.ate ? Date.parse(per.ate + 'T12:00:00Z') : Date.parse(new Date(hojeMs).toISOString().slice(0, 10) + 'T12:00:00Z');
  const dias = Math.round((fim - ini) / 864e5) + 1;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  return { desde: iso(ini - dias * 864e5), ate: iso(ini - 864e5), dias };
}

// Ficha do trem: resumo do histórico de UM trem (sem os filtros cruzados, com o período).
export function fichaTrem(linhas, trem, regra) {
  const ls = linhas.filter(l => l.trem === trem).sort((a, b) => String(b.d).localeCompare(String(a.d)));
  const tec = ls.filter(l => l.nt !== '1');
  const lib = tec.filter(l => l.status === 'LIBERADO').length;
  return {
    trem, total: ls.length, tecnicos: tec.length,
    pct_liberado: tec.length ? Math.round(lib / tec.length * 100) : null,
    primeiro: ls.length ? ls[ls.length - 1].d : '', ultimo: ls.length ? ls[0].d : '',
    por_sistema: agrupar(tec, 'sistema', 10), por_mes: agrupar(tec, 'mes'),
    reincidencias: reincidentes(ls, regra || {}),
    recentes: ls.slice(0, 40),
  };
}

// Ficha genérica (lab, HH): linhas de UM valor de uma dimensão, resumo por outra dimensão.
export function ficha(linhas, dim, valor, resumoDim, medida) {
  const ls = linhas.filter(l => valoresDim(l, dim).includes(valor)).sort((a, b) => String(b.d).localeCompare(String(a.d)));
  return { valor, total: ls.length, medida: valorMedida(ls, medida),
    primeiro: ls.length ? ls[ls.length - 1].d : '', ultimo: ls.length ? ls[0].d : '',
    por_resumo: agrupar(ls, resumoDim, 10, medida), recentes: ls.slice(0, 40) };
}

// Qualidade do dado (painel do gestor): margem de erro que todo indicador carrega.
export function qualidade(linhas) {
  const n = linhas.length || 1;
  const conta = (f) => linhas.filter(f).length;
  return {
    total: linhas.length,
    inferidas: conta(l => l.inf === '1'), pct_inferidas: Math.round(conta(l => l.inf === '1') / n * 1000) / 10,
    com_ios: conta(l => l.io === '1'), pct_ios: Math.round(conta(l => l.io === '1') / n * 1000) / 10,
    sem_trem: conta(l => !l.trem), sem_data: conta(l => !l.d), nao_tecnicos: conta(l => l.nt === '1'),
    historico: conta(l => l.fonte === 'arquivo'), novo: conta(l => l.fonte !== 'arquivo'),
  };
}

const mediana = (v) => { if (!v.length) return null; const s = v.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2 * 10) / 10; };

// KPIs de cada fonte. sentido: 'mais' (subir é bom) | 'menos' (subir é ruim) | '' (neutro). fmt: int|pct|dec|hh.
// `ctx` = { reincidentes: n, hojeMs, dias (tamanho do período), frota (32) }.
export function kpisDe(tipo, ls, ctx = {}) {
  if (tipo === 'lab') {
    const fech = ls.filter(l => l.dias !== '' && l.dias != null).map(l => Number(l.dias));
    const hoje = ctx.hojeMs || Date.now();
    const velha = ls.filter(l => l.ab === '1' && l.d).reduce((m, l) => Math.max(m, Math.floor((hoje - Date.parse(l.d + 'T12:00:00Z')) / 864e5)), 0);
    return [
      { id: 'ordens', rotulo: 'Ordens no filtro', valor: ls.length, fmt: 'int', sentido: '' },
      { id: 'abertas', rotulo: 'Abertas agora', valor: ls.filter(l => l.ab === '1').length, fmt: 'int', sentido: 'menos' },
      { id: 'fechadas', rotulo: 'Fechadas', valor: fech.length, fmt: 'int', sentido: 'mais' },
      { id: 'dias_media', rotulo: 'Dias até fechar (média)', valor: fech.length ? Math.round(fech.reduce((s, x) => s + x, 0) / fech.length * 10) / 10 : null, fmt: 'dec', sentido: 'menos' },
      { id: 'dias_mediana', rotulo: 'Mediana (dias)', valor: mediana(fech), fmt: 'dec', sentido: 'menos' },
      { id: 'mais_velha', rotulo: 'Dias da mais velha aberta', valor: velha || null, fmt: 'int', sentido: 'menos', semComparar: true },
    ];
  }
  if (tipo === 'hh') {
    const hh = ls.reduce((s, l) => s + (Number(l.hh) || 0), 0);
    const ordens = new Set(ls.map(l => l.ordem).filter(Boolean)).size;
    return [
      { id: 'hh', rotulo: 'HH apropriado', valor: Math.round(hh * 10) / 10, fmt: 'hh', sentido: '' },
      { id: 'apropriacoes', rotulo: 'Apropriações', valor: ls.length, fmt: 'int', sentido: '' },
      { id: 'pessoas', rotulo: 'Pessoas', valor: new Set(ls.map(l => l.pessoa)).size, fmt: 'int', sentido: '' },
      { id: 'ordens', rotulo: 'Ordens', valor: ordens, fmt: 'int', sentido: '' },
      { id: 'hh_ordem', rotulo: 'HH por ordem', valor: ordens ? Math.round(hh / ordens * 10) / 10 : null, fmt: 'dec', sentido: '' },
    ];
  }
  if (tipo === 'ncc') {
    // Movimentos de doação: entradas, saídas, cestas montadas, valor estimado em R$.
    const soma = (f) => ls.filter(f).reduce((s, l) => s + (Number(l.qtd) || 0), 0);
    const conta = (t) => ls.filter(l => String(l.tipo).toUpperCase() === t).length;
    return [
      { id: 'entradas', rotulo: 'Doações recebidas', valor: conta('ENTRADA'), fmt: 'int', sentido: 'mais' },
      { id: 'cestas', rotulo: 'Cestas montadas', valor: conta('CESTA'), fmt: 'int', sentido: 'mais' },
      { id: 'saidas', rotulo: 'Saídas de estoque', valor: conta('SAIDA'), fmt: 'int', sentido: '' },
      { id: 'produtos', rotulo: 'Produtos movimentados', valor: new Set(ls.map(l => l.produto).filter(Boolean)).size, fmt: 'int', sentido: '' },
      { id: 'quem', rotulo: 'Pessoas registrando', valor: new Set(ls.map(l => l.quem).filter(Boolean)).size, fmt: 'int', sentido: '' },
      { id: 'valor', rotulo: 'Valor estimado recebido', valor: Math.round(soma(l => String(l.tipo).toUpperCase() === 'ENTRADA') * 100) / 100, fmt: 'dec', sentido: 'mais' },
    ];
  }
  const lib = ls.filter(l => l.status === 'LIBERADO').length;
  const rt = retrabalho(ls, 3);
  // MTBF de calendário (frota de 32): dias do período × 32 ÷ falhas (técnicos que não são preventiva/inspeção).
  const falhas = ls.filter(l => l.nt !== '1' && !/PREVENTIVA|INSPE/.test(l.tipo || '')).length;
  const mtbf = ctx.dias && falhas ? Math.round(ctx.dias * (ctx.frota || 32) / falhas * 10) / 10 : null;
  return [
    { id: 'registros', rotulo: 'Registros no filtro', valor: ls.length, fmt: 'int', sentido: 'menos' },
    { id: 'trens', rotulo: 'Trens envolvidos', valor: new Set(ls.map(l => l.trem).filter(Boolean)).size, fmt: 'int', sentido: 'menos' },
    { id: 'reincidentes', rotulo: 'Reincidentes', valor: ctx.reincidentes == null ? null : ctx.reincidentes, fmt: 'int', sentido: 'menos', semComparar: true, alerta: ctx.reincidentes > 0 },
    { id: 'liberados', rotulo: 'Saíram liberados', valor: ls.length ? Math.round(lib / ls.length * 100) : null, fmt: 'pct', sentido: 'mais' },
    { id: 'retrabalho', rotulo: 'Retrabalho (voltou em ≤3 dias)', valor: rt.pct, fmt: 'pct', sentido: 'menos' },
    { id: 'mtbf', rotulo: 'Dias entre falhas por trem (MTBF)', valor: mtbf, fmt: 'dec', sentido: 'mais' },
  ];
}

// Variação contra o período anterior: { pct, sinal: 'bom'|'ruim'|'' }.
export function variacao(atual, antes, sentido) {
  if (atual == null || antes == null || antes === 0) return null;
  const pct = Math.round((atual - antes) / Math.abs(antes) * 100);
  if (!pct) return { pct: 0, sinal: '' };
  const melhorou = sentido === 'mais' ? pct > 0 : sentido === 'menos' ? pct < 0 : null;
  return { pct, sinal: melhorou === null ? '' : melhorou ? 'bom' : 'ruim' };
}

// Meta do ADM (semáforo): { valor, sentido: 'max' (não passar de) | 'min' (pelo menos) } -> 'ok' | 'fora' | ''.
export function situacaoMeta(valor, meta) {
  if (!meta || valor == null) return '';
  return meta.sentido === 'min' ? (valor >= meta.valor ? 'ok' : 'fora') : (valor <= meta.valor ? 'ok' : 'fora');
}

export function formatar(v, fmt) {
  if (v == null || v === '') return '—';
  if (fmt === 'pct') return String(v).replace('.', ',') + '%';
  if (fmt === 'dec' || fmt === 'hh') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return Number(v).toLocaleString('pt-BR');
}
