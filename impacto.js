// impacto.js — números em R$ do Painel (D24): o tamanho do trabalho, dentro do "Como estamos agora".
// Os gráficos de valor (R$ por mês, doado × comprado, por categoria…) são gráficos NATIVOS do motor do painel
// (medida "Valor estimado", configuráveis pelo ADM); aqui ficam só os blocos de número e "o que tem numa cesta".
// Valores = estimativa: preço de mercado de Rio de Janeiro corrigido pela inflação de cada produto (IBGE, a cada 90 dias).

const brl = (v, centavos) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: centavos ? 2 : 0 });
const num = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function tile(el, valor, rotulo, cls) {
  const t = el('div', cls || null);
  t.append(el('b', null, valor), el('span', null, rotulo));
  return t;
}

// Devolve os elementos a acrescentar na seção do resumo. `el(tag, cls, texto)` vem do motor do painel.
export function blocosReais(d, el) {
  if (!d || d.ok === false) return [];
  const out = [];
  out.push(el('h3', null, 'Nosso trabalho em reais'));
  const tot = d.recebido.doado + d.recebido.comprado;
  const pDoado = tot ? Math.round(100 * d.recebido.doado / tot) : 0;
  const tiles = el('div', 'pn-tiles pn-tiles-rs');
  tiles.append(
    tile(el, brl(d.entregue.valor), 'em alimentos já entregues', 'destaque'),
    tile(el, num(d.cestas.total), d.cestas.total === 1 ? 'cesta entregue' : 'cestas entregues'),
    tile(el, num(d.familias), d.familias === 1 ? 'família atendida' : 'famílias atendidas'),
    tile(el, num(d.entregue.kg) + ' kg', 'de comida entregue'),
    tile(el, brl(d.entregue.valor_ano), 'entregues só em ' + d.ano + ' (' + num(d.cestas.ano) + ' cestas)'),
    tile(el, brl(d.valor_cesta), 'vale uma cesta no mercado' + (d.kg_cesta ? ' (≈ ' + num(d.kg_cesta) + ' kg)' : '')),
    tile(el, brl(d.falta_proxima_reais), 'faltam em alimentos p/ a próxima cesta', 'aviso'),
    tile(el, brl(d.recebido.doado + d.recebido.comprado), 'entraram no estoque (doado + comprado)'),
    tile(el, brl(d.recebido.doado), 'recebidos em doações' + (tot ? ' (' + pDoado + '%)' : '')),
    tile(el, brl(d.recebido.comprado), 'comprados pela igreja' + (tot ? ' (' + (100 - pDoado) + '%)' : ''))
  );
  out.push(tiles);
  if (d.valor_cesta > 0 && d.kg_cesta > 0) {
    out.push(el('p', 'pn-frase', 'Com pouco a gente ajuda muito: cada R$ 10 vira cerca de ' +
      (10 * d.kg_cesta / d.valor_cesta).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' kg de alimento na mesa de uma família.'));
  }

  // O que tem numa cesta (receita × preço): barras horizontais, do item mais caro ao mais barato.
  const itens = (d.itens_cesta || []).filter(i => i.valor > 0);
  if (itens.length) {
    out.push(el('h3', null, 'O que tem numa cesta de ' + brl(d.valor_cesta)));
    const max = Math.max(...itens.map(i => i.valor));
    const ul = el('ul', 'pn-hbar');
    itens.forEach(i => {
      const li = el('li');
      li.title = i.nome + ': ' + brl(i.valor, true) + ' (' + Math.round(100 * i.valor / (d.valor_cesta || 1)) + '% da cesta)';
      const trilho = el('span', 'pn-hbar-trilho'), barra = el('span', 'pn-hbar-barra');
      barra.style.width = Math.max(2, 100 * i.valor / max) + '%';
      trilho.appendChild(barra);
      li.append(el('span', 'pn-hbar-nome', i.nome), trilho, el('span', 'pn-hbar-val', brl(i.valor, true)));
      ul.appendChild(li);
    });
    out.push(ul);
  }
  const at = d.precos_atualizados_em ? new Date(d.precos_atualizados_em) : null;
  out.push(el('p', 'nota', 'Valores estimados: preço de mercado de Rio de Janeiro corrigido pela inflação de cada produto (IBGE)' +
    (at && !isNaN(at) ? ', atualizado em ' + MESES[at.getMonth()] + '/' + at.getFullYear() : '') + '. Os gráficos com "R$" abaixo usam esses preços.'));
  return out;
}
