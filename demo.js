// demo.js — backend de mentira, só no navegador, para ver e testar o front sem o GAS.
// Entra sozinho enquanto config.js ainda tem o texto COLE_AQUI…; com a URL /exec real
// este arquivo nunca é carregado.
// Logins: rogerio / demo (ADMIN) · juraci / demo (voluntário) · maria / demo (voluntário).
// Os dados de exemplo cobrem ~8 meses de movimentos (entradas, cestas, saídas, ajustes,
// descartes) para o painel, os gráficos e o histórico terem o que mostrar.
// Botão "reiniciar dados de exemplo" na faixa amarela recria tudo do zero.

const CHAVE = 'siga:demo';
const dia = (delta) => {
  const d = new Date(); d.setDate(d.getDate() + delta);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const agora = () => new Date().toISOString();
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
const senhaTemp = (semente) => 'Demo-' + String(semente).slice(-4);

// Determinístico (sem Math.random): o demo fica sempre igual, bom para comparar telas.
const pega = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

const VOLUNTARIOS = ['Maria (voluntária)', 'Guilherme Juraci', 'Ana Paula', 'Carlos Nunes'];
const DOADORES = ['Mercado Bom Preço', 'Família Souza', 'Igreja Central', 'Família Lima', 'Cia. Alimentos', 'Padaria Nova', 'Grupo Jovem'];
const FAMILIAS = ['Família Pereira', 'Dona Antônia', 'Família Moreira', 'Sr. Bento', 'Família Rossi', 'Dona Ivone', 'Família Fagundes', 'Família Klein'];

// 16 itens da cesta (mesma lista do backend). [id, nome, unidade, categoria, preço, qtd na cesta, local]
const CESTA = [
  ['PROD-1', 'Arroz', 'kg', 'Grãos', 5.0, 5, 'P1-A'],
  ['PROD-2', 'Feijão', 'kg', 'Grãos', 8.5, 2, 'P1-A'],
  ['PROD-3', 'Açúcar', 'kg', 'Mercearia', 4.2, 2, 'P1-B'],
  ['PROD-4', 'Farinha de trigo', 'kg', 'Grãos', 4.8, 1, 'P1-B'],
  ['PROD-5', 'Fubá', 'kg', 'Grãos', 4.2, 1, 'P2-A'],
  ['PROD-6', 'Farinha de mandioca', 'kg', 'Grãos', 7.0, 1, 'P2-A'],
  ['PROD-7', 'Sal', 'kg', 'Temperos', 2.5, 1, 'P2-B'],
  ['PROD-8', 'Espaguete', 'pacote', 'Massas', 4.5, 1, 'P3-A'],
  ['PROD-9', 'Macarrão', 'pacote', 'Massas', 4.8, 1, 'P3-A'],
  ['PROD-10', 'Molho de tomate', 'sachê', 'Molhos', 2.6, 3, 'P3-B'],
  ['PROD-11', 'Achocolatado', 'lata', 'Bebidas', 9.0, 1, 'P3-B'],
  ['PROD-12', 'Café', 'pacote', 'Bebidas', 24.0, 1, 'P4-A'],
  ['PROD-13', 'Leite em pó', 'pacote', 'Bebidas', 18.0, 1, 'P4-A'],
  ['PROD-14', 'Enlatados', 'un', 'Enlatados', 6.5, 2, 'P4-B'],
  ['PROD-15', 'Óleo', 'garrafa', 'Óleos', 8.0, 1, 'P4-B'],
  ['PROD-16', 'Biscoito de sal', 'pacote', 'Biscoitos', 4.5, 1, 'P5-A']
];

function inicial() {
  const produtos = CESTA.map(([id_produto, nome, unidade, categoria, preco_estimado, qtd_cesta, local]) =>
    ({ id_produto, nome, unidade, categoria, local, preco_estimado, qtd_padrao_cesta: qtd_cesta, unidade_cesta: unidade, validade_dias_alerta: 30, ativo: true }));
  const itens = CESTA.map(([id, nome, uni, , , qtd], i) => ({
    id_item: 'CI-' + (i + 1), produto_id: id, nome, qtd, unidade: unidadeCesta(id) || uni, ativo: true
  }));
  const lote = (n, produto_id, qtd, validade, doador) => {
    const p = produtos.find(x => x.id_produto === produto_id);
    return { id_lote: 'LOTE-' + n, produto_id, produto: p.nome, unidade: p.unidade, qtd, validade, local: p.local, doador, lote: '', data_entrada: dia(-(20 + n * 3)), situacao: 'ATIVO' };
  };

  // ---- estoque: cada produto com ~4 a 9 cestas de saldo, em 2 lotes ----
  const lotes = [];
  let n = 0;
  produtos.forEach((p, i) => {
    const total = p.qtd_padrao_cesta * (4 + (i % 6));
    const primeira = Math.max(1, Math.round(total / 2));
    lotes.push(lote(++n, p.id_produto, primeira, dia(210 + i * 14), pega(DOADORES, i)));
    lotes.push(lote(++n, p.id_produto, total - primeira, dia(95 + i * 11), pega(DOADORES, i + 3)));
  });
  // alguns lotes vencendo/vencido, para os alertas e o "vencendo em 30 dias" terem o que mostrar
  lotes.push(lote(++n, 'PROD-9', 2, dia(-4), 'Mercado Bom Preço'));   // já vencido
  lotes.push(lote(++n, 'PROD-15', 3, dia(11), 'Cia. Alimentos'));      // vence logo
  lotes.push(lote(++n, 'PROD-12', 2, dia(24), 'Padaria Nova'));        // vence em <30d

  // ---- ~8 meses de movimentos + cestas montadas ----
  const movimentos = [];
  const cestas = [];
  for (let i = 0; i < 220; i++) {
    const delta = Math.floor((i * 13) % 240);
    const ts = dia(-delta) + 'T' + String(7 + ((i * 3) % 11)).padStart(2, '0') + ':' + String((i * 7) % 60).padStart(2, '0') + ':00';
    const p = pega(produtos, i);
    const quem = pega(VOLUNTARIOS, i);
    const r = i % 10;
    if (r <= 5) {                                   // ENTRADA (doação)
      movimentos.push({ timestamp: ts, tipo: 'ENTRADA', produto_id: p.id_produto, produto: p.nome, qtd: pega([1, 2, 3, 5, 8, 10], i), unidade: p.unidade, local: p.local, quem, observacao: pega(DOADORES, i), origem: i % 9 === 4 ? 'COMPRA' : 'DOACAO' });
    } else if (r === 6 || r === 7) {                // CESTA (cesta montada/entregue)
      const dest = pega(FAMILIAS, i);
      movimentos.push({ timestamp: ts, tipo: 'CESTA', destinatario: dest, qtd: 16, unidade: 'itens', quem, observacao: 'Cesta entregue' });
      cestas.push({ timestamp: ts, destinatario: dest, observacao: '', qtd_itens: 16, montada_por: quem });
    } else if (r === 8) {                           // SAIDA (consumo interno / outra frente)
      movimentos.push({ timestamp: ts, tipo: 'SAIDA', produto_id: p.id_produto, produto: p.nome, qtd: pega([1, 2, 3], i), unidade: p.unidade, local: p.local, quem, observacao: 'Uso interno / outro projeto' });
    } else {                                        // AJUSTE ou DESCARTE
      if (i % 20 === 9) movimentos.push({ timestamp: ts, tipo: 'DESCARTE', produto_id: p.id_produto, produto: p.nome, qtd: 1, unidade: p.unidade, local: p.local, quem, observacao: 'Produto vencido — descarte' });
      else movimentos.push({ timestamp: ts, tipo: 'AJUSTE', produto_id: p.id_produto, produto: p.nome, qtd: pega([-1, 1, 2], i), unidade: p.unidade, local: p.local, quem, observacao: 'Ajuste de inventário' });
    }
  }
  movimentos.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  cestas.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const usuarios = [
    { login: 'rogerio', nome_completo: 'Rogério Ramos', papel: 'ADMIN', ativo: true, senha: 'demo', ultimo_login: agora(), forcar_troca_senha: false },
    { login: 'juraci', nome_completo: 'Guilherme Juraci', papel: 'VOLUNTARIO', ativo: true, senha: 'demo', ultimo_login: dia(-2) + 'T19:12:00', forcar_troca_senha: false },
    { login: 'maria', nome_completo: 'Maria (voluntária)', papel: 'VOLUNTARIO', ativo: true, senha: 'demo', ultimo_login: dia(-5) + 'T09:40:00', forcar_troca_senha: false }
  ];

  const solicitacoes = [
    { id_solicitacao: 'SOL-1', nome_completo: 'Ana Paula Ribeiro', telefone: '(21) 99911-2233', email: 'ana.ribeiro@email.com', motivo: 'Quero ajudar nas entregas das cestas', login_sugerido: 'ana', status: 'PENDENTE', timestamp: dia(-1) + 'T20:15:00', observacao: '', resolvido_por: '', resolvido_em: '' },
    { id_solicitacao: 'SOL-2', nome_completo: 'Carlos Nunes', telefone: '(21) 99855-7788', email: 'carlos.nunes@email.com', motivo: 'Sou do grupo de jovens', login_sugerido: 'carlos', status: 'PENDENTE', timestamp: dia(0) + 'T08:02:00', observacao: '', resolvido_por: '', resolvido_em: '' },
    { id_solicitacao: 'SOL-3', nome_completo: 'Guilherme Juraci', telefone: '(21) 99700-1122', email: 'juraci@email.com', motivo: 'Voluntário dos sábados', login_sugerido: 'juraci', status: 'APROVADA', timestamp: dia(-9) + 'T11:30:00', observacao: '', resolvido_por: 'Rogério Ramos', resolvido_em: dia(-8) + 'T10:05:00' },
    { id_solicitacao: 'SOL-3b', nome_completo: 'Desconhecido', telefone: '', email: 'sem@email.com', motivo: 'Quero acesso', login_sugerido: 'teste', status: 'RECUSADA', timestamp: dia(-6) + 'T14:00:00', observacao: 'Não identificamos a pessoa — pedir referência', resolvido_por: 'Rogério Ramos', resolvido_em: dia(-6) + 'T18:30:00' }
  ];

  const config_sistema = [
    { chave: 'sessao_horas', valor: '12', descricao: 'Horas que a sessão dura sem uso' },
    { chave: 'validade_alerta_dias', valor: '30', descricao: 'Dias de antecedência p/ alertar vencimento' },
    { chave: 'limpeza_dias', valor: '2,6', descricao: 'Dias da semana da limpeza (0=dom … 6=sáb)' },
    { chave: 'limpeza_hora', valor: '08:00', descricao: 'Hora do alerta de limpeza' },
    { chave: 'estoque_minimo_cestas', valor: '1', descricao: 'Abaixo disso, alerta de estoque baixo' },
    { chave: 'app_nome', valor: 'SIGA-NCC', descricao: 'Nome exibido no app' },
    { chave: 'app_versiculo_ativo', valor: 'TRUE', descricao: 'Mostra o versículo rotativo' }
  ];

  const logs = [
    ['rogerio', 'LOGIN', 'entrou no sistema'], ['juraci', 'MOVIMENTO', 'registrou entrada de Arroz'],
    ['maria', 'CESTA_MONTAR', 'montou cesta para Família Pereira'], ['rogerio', 'PRODUTO', 'editou preço do Café'],
    ['rogerio', 'CONFIG', 'alterou validade_alerta_dias'], ['ana', 'SOLICITACAO', 'pediu acesso'],
    ['juraci', 'ESTOQUE', 'registrou saída de Feijão'], ['rogerio', 'ALERTA', 'gerou alertas automáticos'],
    ['maria', 'LOGIN', 'entrou no sistema'], ['rogerio', 'USUARIO', 'aprovou acesso de juraci']
  ].map(([usuario_login, acao, detalhe], i) => ({ timestamp: dia(-i) + 'T' + String(8 + i).padStart(2, '0') + ':30:00', usuario_login, acao, detalhe }));

  const alertas = [
    { id_alerta: 'AL-1', severidade: 'URGENTE', tipo: 'VALIDADE', produto: 'Macarrão', mensagem: 'Macarrão: lote vencido há 4 dias — separar para descarte', data_disparo: dia(0), criado_em: dia(0) + 'T07:00:00', resolvido: false, origem: 'SISTEMA', destinatarios: 'TODOS', estados: {} },
    { id_alerta: 'AL-2', severidade: 'AVISO', tipo: 'VALIDADE', produto: 'Óleo', mensagem: 'Óleo: lote vence em 11 dias', data_disparo: dia(0), criado_em: dia(0) + 'T07:00:00', resolvido: false, origem: 'SISTEMA', destinatarios: 'TODOS', estados: {} },
    { id_alerta: 'AL-3', severidade: 'AVISO', tipo: 'VALIDADE', produto: 'Café', mensagem: 'Café: lote vence em 24 dias', data_disparo: dia(0), criado_em: dia(0) + 'T07:00:00', resolvido: false, origem: 'SISTEMA', destinatarios: 'TODOS', estados: {} },
    { id_alerta: 'AL-4', severidade: 'INFO', tipo: 'LIMPEZA', produto: '', mensagem: 'Limpeza das prateleiras da semana', data_disparo: dia(-2), criado_em: dia(-2) + 'T07:00:00', resolvido: false, origem: 'SISTEMA', destinatarios: 'TODOS', estados: {} }
    ,{ id_alerta: 'AL-5', severidade: 'AVISO', tipo: 'PERSONALIZADO', produto: '', titulo: 'Reunião de voluntários no sábado', mensagem: 'Reunião de voluntários no sábado',
      detalhes: 'Chegar às 8h no salão para conferir a lista de entregas do mês e dividir as equipes. Quem não puder, avise no grupo.', data_disparo: dia(-1), criado_em: dia(-1) + 'T18:20:00',
      resolvido: false, origem: 'ADM', criado_por: 'rogerio', destinatarios: 'TODOS', obrigatoria: false, estados: {} }
  ];

  // Recebedores de exemplo: as 8 famílias do histórico ganham nome completo; as cestas antigas ficam ligadas a elas.
  const NOMES_REC = ['Maria Aparecida Pereira', 'Antônia Ferreira de Souza', 'Joana Moreira Lima', 'Bento Carvalho Neto', 'Luciana Rossi Martins', 'Ivone Batista Dias', 'Marcos Fagundes Silva', 'Teresa Klein Oliveira'];
  const recebedores = NOMES_REC.map((nome, i) => ({
    id_recebedor: 'REC-000' + (i + 1), nome_completo: nome, ativo: true, criado_em: dia(-120 + i), criado_por: 'rogerio',
    telefone: i % 3 === 2 ? '' : '(21) 9' + (9000 + i * 137) + '-' + (1000 + i * 911), endereco: i % 2 ? '' : 'Rua das Flores, ' + (10 + i * 7),
    email: '', observacao: ''
  }));
  cestas.forEach(c => { const i = FAMILIAS.indexOf(c.destinatario); if (i >= 0 && c.status !== 'EMBALADA') { c.recebedor_id = 'REC-000' + (i + 1); c.destinatario = NOMES_REC[i]; } });
  movimentos.forEach(m => { const i = FAMILIAS.indexOf(m.destinatario); if (i >= 0) { m.destinatario = NOMES_REC[i]; if (m.tipo === 'CESTA' || m.tipo === 'ENTREGA') m.recebedor_id = 'REC-000' + (i + 1); } });

  const convocacoes = [{
    id_conv: 'CONV-0001', titulo: 'Montagem das cestas de novembro', data: dia(6), hora: '08:30', local: 'Salão da igreja', descricao: 'Trazer avental. Café da manhã por nossa conta.',
    status: 'ABERTA', criada_por: 'rogerio',
    vagas: [
      { id_vaga: 'VAGA-0001', tarefa: 'Separar os itens', vagas_total: 3, inscritos: [{ id_insc: 'INSC-0001', usuario_login: 'maria', nome: 'Maria (voluntária)', nome_livre: '', obs: '' }, { id_insc: 'INSC-0002', usuario_login: '', nome: 'Dona Cida', nome_livre: 'Dona Cida', obs: '' }] },
      { id_vaga: 'VAGA-0002', tarefa: 'Embalar', vagas_total: 2, inscritos: [{ id_insc: 'INSC-0003', usuario_login: 'rogerio', nome: 'Rogério Ramos', nome_livre: '', obs: '' }] },
      { id_vaga: 'VAGA-0003', tarefa: 'Organizar e entregar', vagas_total: 2, inscritos: [] }
    ]
  }];

  return { produtos, itens, lotes, movimentos, cestas, usuarios, solicitacoes, alertas, logs, config_sistema, recebedores, convocacoes, levantamento: {}, config: null };
}

function unidadeCesta(id) {
  if (id === 'PROD-10') return 'sachê';
  if (id === 'PROD-14') return 'un';
  return null;
}

let bd = null;
function carregar() {
  if (bd) return bd;
  try { bd = JSON.parse(localStorage.getItem(CHAVE)); } catch (e) { bd = null; }
  // Banco guardado por uma versão anterior (faltam tabelas que o código novo usa) → recomeça do zero,
  // senão estoura "Cannot read properties of undefined (reading 'find')".
  const modelo = inicial();
  if (!bd || Object.keys(modelo).some(k => !(k in bd))) bd = modelo;
  return bd;
}
function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify(bd)); } catch (e) {} }

const ativos = (b) => b.lotes.filter(l => l.situacao === 'ATIVO' && l.qtd > 0);
const saldoDe = (b, id) => ativos(b).filter(l => l.produto_id === id).reduce((s, l) => s + Number(l.qtd), 0);

function kpis(b) {
  const itens = b.itens.filter(i => i.ativo);
  const saldo = itens.map(i => {
    const disponivel = saldoDe(b, i.produto_id);
    return { produto_id: i.produto_id, nome: i.nome, unidade: i.unidade, qtd_cesta: i.qtd, disponivel, cestas_cabem: Math.floor(disponivel / i.qtd) };
  });
  const hoje = dia(0), em30 = dia(30);
  const mes = new Date().toISOString().slice(0, 7);
  const vencendo = ativos(b).filter(l => l.validade && l.validade >= hoje && l.validade <= em30);
  return {
    ok: true,
    cestas_possiveis: saldo.length ? Math.min(...saldo.map(s => s.cestas_cabem)) : 0,
    alertas_pendentes: b.alertas.filter(a => !a.resolvido).length,
    validade: {
      vencendo_30d: vencendo.length,
      vencidos: ativos(b).filter(l => l.validade && l.validade < hoje).length,
      itens_vencendo: vencendo.map(l => ({ produto: l.produto, qtd: l.qtd, unidade: l.unidade, validade: l.validade }))
    },
    mes: {
      entradas: b.movimentos.filter(m => m.tipo === 'ENTRADA' && m.timestamp.startsWith(mes)).length,
      cestas_montadas: b.movimentos.filter(m => m.tipo === 'CESTA' && m.timestamp.startsWith(mes)).length
    },
    saldo
  };
}

function log(b, quem, acao, detalhe) { b.logs.unshift({ timestamp: agora(), usuario_login: quem || '—', acao, detalhe }); if (b.logs.length > 200) b.logs.length = 200; }

// ============================ painel (aba Início) ============================
function painelFonte() {
  return {
    id: 'ncc',
    medidas: [
      { id: 'qtd', rotulo: 'Quantidade', agg: 'soma' },
      { id: 'movs', rotulo: 'Movimentações', agg: 'contagem' },
      { id: 'valor', rotulo: 'Valor estimado (R$)', agg: 'soma' }
    ],
    dims: [
      { id: 'dia_semana', rotulo: 'Dia da semana', tempo: true },
      { id: 'dia_mes', rotulo: 'Dia do mês', ordenada: true },
      { id: 'mes', rotulo: 'Mês', tempo: true },
      { id: 'tipo', rotulo: 'Tipo de movimento' },
      { id: 'produto', rotulo: 'Produto' },
      { id: 'categoria', rotulo: 'Categoria' },
      { id: 'local', rotulo: 'Local na prateleira' },
      { id: 'origem', rotulo: 'Origem da entrada' },
      { id: 'unidade', rotulo: 'Unidade' },
      { id: 'quem', rotulo: 'Quem registrou' },
      { id: 'destinatario', rotulo: 'Destinatário' }
    ],
    kpis: 'ncc', reinc: false
  };
}

function painelConfig(b) {
  if (b.config && Array.isArray(b.config.graficos) && b.config.graficos.length) return b.config;
  const E = { campo: 'tipo', valor: 'ENTRADA' };
  const CE = { campo: 'tipo', valor: 'CESTA' };
  return {
    graficos: [
      { id: 'g_doacoes_mes', titulo: 'Doações por mês', dimensao: 'mes', tipo: 'linha', filtro: E },
      { id: 'g_categoria', titulo: 'Doações por categoria', dimensao: 'categoria', tipo: 'pizza', filtro: E },
      { id: 'g_dia_semana', titulo: 'Entradas por dia da semana', dimensao: 'dia_semana', tipo: 'barras', filtro: E },
      { id: 'g_dia_mes', titulo: 'Entradas por dia do mês', dimensao: 'dia_mes', tipo: 'barras', filtro: E },
      { id: 'g_produtos', titulo: 'Produtos que mais entram', dimensao: 'produto', tipo: 'pareto', filtro: E },
      { id: 'g_voluntarios', titulo: 'Quem registra os movimentos', dimensao: 'quem', tipo: 'barras', top: 8 },
      { id: 'g_cestas_mes', titulo: 'Cestas montadas por mês', dimensao: 'mes', tipo: 'linha', filtro: { campo: 'tipo', valor: 'CESTA' } },
      { id: 'g_mapa', titulo: 'Categoria × dia da semana', dimensao: 'categoria', dimensao2: 'dia_semana', tipo: 'mapa', filtro: { campo: 'tipo', valor: 'ENTRADA' } },
      { id: 'g_valor', titulo: 'Valor estimado recebido por produto', dimensao: 'produto', tipo: 'barras', medida: 'valor', filtro: { campo: 'tipo', valor: 'ENTRADA' } },
      { id: 'g_rs_cestas_mes', titulo: 'R$ em alimentos entregues em cestas, por mês', dimensao: 'mes', tipo: 'linha', medida: 'valor', filtro: CE },
      { id: 'g_rs_origem', titulo: 'Doado × comprado (R$)', dimensao: 'origem', tipo: 'pizza', medida: 'valor', filtro: E },
      { id: 'g_rs_recebido_mes', titulo: 'R$ recebidos em alimentos, por mês', dimensao: 'mes', tipo: 'linha', medida: 'valor', filtro: E },
      { id: 'g_rs_categoria', titulo: 'R$ recebidos por categoria', dimensao: 'categoria', tipo: 'pizza', medida: 'valor', filtro: E },
      { id: 'g_rs_saidas', titulo: 'R$ movimentados, por tipo de movimento', dimensao: 'tipo', tipo: 'barras', medida: 'valor' }
    ]
  };
}

function painelResumo(b) {
  const k = kpis(b);
  const possiveis = k.cestas_possiveis || 0;
  const faltas = [];
  (k.saldo || []).forEach(s => {
    const falta = Math.round((Number(s.qtd_cesta) * (possiveis + 1) - Number(s.disponivel)) * 100) / 100;
    if (falta > 0) faltas.push({ nome: s.nome, falta, unidade: s.unidade });
  });
  faltas.sort((a, c) => c.falta - a.falta);
  const prods = {}; b.produtos.forEach(p => { prods[p.id_produto] = p; });
  let kg = 0, valor = 0;
  const lista = ativos(b);
  lista.forEach(l => {
    const q = Number(l.qtd) || 0;
    if (/^(kg|kilo|quilo)/i.test(String(l.unidade))) kg += q;
    valor += q * (Number((prods[l.produto_id] || {}).preco_estimado) || 0);
  });
  return {
    cestas_possiveis: possiveis, faltas_proxima: faltas, saldo: k.saldo,
    alertas_pendentes: k.alertas_pendentes, validade: k.validade,
    estoque: { lotes: lista.length, kg: Math.round(kg * 10) / 10, valor_estimado: Math.round(valor * 100) / 100 },
    impacto: ROTAS.impacto(b),
    gerado_em: agora()
  };
}

function painelLinhas(b) {
  const prods = {}; b.produtos.forEach(p => { prods[p.id_produto] = p; });
  // valor da cesta = receita × preço (o movimento CESTA é 1 linha-resumo, igual ao Backend)
  const valorReceita = b.itens.filter(i => i.ativo).reduce((t, i) => t + i.qtd * (Number((prods[i.produto_id] || {}).preco_estimado) || 0), 0);
  const ROT = { DOACAO: 'Doação', COMPRA: 'Compra da igreja', LEVANTAMENTO: 'Levantamento inicial' };
  const linhas = (b.movimentos || []).map(m => {
    const ts = String(m.timestamp || ''); const d = ts.slice(0, 10);
    const prod = prods[m.produto_id] || {};
    const qtd = Math.abs(Number(m.qtd) || 0);
    const tipo = String(m.tipo || '').toUpperCase();
    const valor = tipo === 'CESTA' ? valorReceita : tipo === 'ENTREGA' ? 0 : qtd * (Number(prod.preco_estimado) || 0);
    return {
      origem: tipo === 'ENTRADA' ? (ROT[m.origem] || 'Doação') : '',
      d, dia_mes: d ? ('0' + Number(d.slice(8, 10))).slice(-2) : '', mes: d ? d.slice(0, 7) : '',
      tipo, produto: prod.nome || m.produto || m.produto_id || (tipo === 'CESTA' || tipo === 'ENTREGA' ? 'Cesta completa' : ''),
      categoria: prod.categoria || 'OUTRO', local: m.local || prod.local || '', unidade: m.unidade || '',
      quem: m.quem || '', destinatario: m.destinatario || '', qtd,
      valor: Math.round(valor * 100) / 100
    };
  });
  const campos = ['d', 'dia_mes', 'mes', 'tipo', 'origem', 'produto', 'categoria', 'local', 'unidade', 'quem', 'destinatario', 'qtd', 'valor'];
  const dic = {}, pos = {}; campos.forEach(c => { dic[c] = []; pos[c] = {}; });
  const out = linhas.map(l => campos.map(c => {
    const v = l[c] == null ? '' : String(l[c]);
    if (pos[c][v] === undefined) { pos[c][v] = dic[c].length; dic[c].push(v); }
    return pos[c][v];
  }));
  return { ok: true, fonte: painelFonte(), campos, dic, linhas: out, total: linhas.length, config: painelConfig(b), resumo: painelResumo(b), gerado_em: agora() };
}

// monta alertas a partir do estoque atual (sem duplicar aberto do mesmo tipo+produto).
function montarAlertas(b) {
  const hoje = dia(0), em = dia(30);
  let criados = 0;
  const push = (tipo, produto, mensagem, severidade) => {
    if (b.alertas.some(a => !a.resolvido && a.tipo === tipo && a.produto === produto)) return;
    b.alertas.unshift({ id_alerta: 'AL-' + Date.now().toString(36) + '-' + criados, tipo, produto, mensagem, severidade, data_disparo: hoje, criado_em: agora(), resolvido: false, origem: 'SISTEMA', destinatarios: 'TODOS', estados: {} });
    criados++;
  };
  ativos(b).forEach(l => {
    if (!l.validade) return;
    if (l.validade < hoje) push('VALIDADE', l.produto, `${l.produto}: lote vencido (${l.validade}) — descartar`, 'URGENTE');
    else if (l.validade <= em) push('VALIDADE', l.produto, `${l.produto}: vence em ${l.validade}`, 'AVISO');
  });
  const minimo = Number((b.config_sistema.find(c => c.chave === 'estoque_minimo_cestas') || {}).valor || 1);
  b.itens.filter(i => i.ativo).forEach(i => {
    const c = Math.floor(saldoDe(b, i.produto_id) / i.qtd);
    if (c < minimo) push('ESTOQUE', i.nome, `${i.nome}: só dá ${c} cesta(s)`, 'URGENTE');
  });
  return criados;
}

// ============================ rotas ============================
const nomeDe = (b, id) => (b.produtos.find(p => p.id_produto === id) || {}).nome || id;
const unidadeDe = (b, id) => (b.produtos.find(p => p.id_produto === id) || {}).unidade || '';
function faltasDemo(b, itens) {
  return itens.filter(i => saldoDe(b, i.produto_id) < i.qtd)
    .map(i => nomeDe(b, i.produto_id) + ' (falta ' + (Math.round((i.qtd - saldoDe(b, i.produto_id)) * 100) / 100) + ' ' + i.unidade + ')');
}
function baixarFIFO(b, produtoId, qtd) {
  let falta = qtd;
  ativos(b).filter(l => l.produto_id === produtoId).sort((x, y) => String(x.validade || '9999').localeCompare(String(y.validade || '9999')))
    .forEach(l => { if (falta <= 0) return; const t = Math.min(Number(l.qtd), falta); l.qtd = Math.round((Number(l.qtd) - t) * 1000) / 1000; falta -= t; if (l.qtd <= 0) l.situacao = 'CONSUMIDO'; });
}

// ---- recebedores: alerta de repetição no mês (não bloqueia) ----
const mesDe = (iso) => String(iso || '').slice(0, 7);
function entregasDe(b, id) {
  const l = [];
  b.cestas.forEach(c => { if (c.recebedor_id === id && (c.status || 'ENTREGUE') === 'ENTREGUE') l.push({ tipo: 'CESTA', data: c.entregue_em || c.timestamp, por: c.entregue_por || c.montada_por, id_cesta: c.id_cesta, obs: c.observacao || '' }); });
  b.movimentos.forEach(m => { if (m.recebedor_id === id && m.tipo === 'SAIDA') l.push({ tipo: 'AVULSA', data: m.timestamp, por: m.quem, id_cesta: '', obs: m.observacao || '', produto_id: m.produto_id, qtd: m.qtd, unidade: m.unidade }); });
  return l.sort((x, y) => String(y.data).localeCompare(String(x.data)));
}
function recDto(b, r) {
  const cestas = entregasDe(b, r.id_recebedor).filter(e => e.tipo === 'CESTA');
  const u = cestas[0];
  return { ...r, total_cestas: cestas.length, ultima_cesta: u ? u.data : '', recebeu_mes: !!(u && mesDe(u.data) === mesDe(agora())) };
}
// { erro } | { aviso } | { rec, nome, repetido }
function resolverRecDemo(b, q) {
  const r = b.recebedores.find(x => x.id_recebedor === q.recebedor_id);
  if (!r) return { resp: { ok: false, error: 'recebedor não encontrado' } };
  if (!r.ativo) return { resp: { ok: false, error: 'recebedor inativo — reative no cadastro' } };
  const ult = entregasDe(b, r.id_recebedor).find(e => e.tipo === 'CESTA' && mesDe(e.data) === mesDe(agora())) || null;
  if (ult && !(q.confirmar_repetido === true || q.confirmar_repetido === 'true')) {
    return { resp: { ok: false, aviso: 'JA_RECEBEU', recebedor: { id_recebedor: r.id_recebedor, nome_completo: r.nome_completo }, ultima: ult,
      error: r.nome_completo + ' já recebeu cesta neste mês (' + String(ult.data).slice(0, 10) + ', por ' + (ult.por || '?') + '). Confirme para entregar mesmo assim.' } };
  }
  return { rec: r, nome: r.nome_completo, repetido: ult };
}
function alertaRepetidoDemo(b, rec, ant, u, q) {
  b.alertas.unshift({ id_alerta: 'AL-R' + Date.now().toString(36), severidade: 'AVISO', tipo: 'RECEBEDOR_REPETIDO', produto: '', resolvido: false, data_disparo: dia(0), criado_em: agora(), origem: 'SISTEMA', destinatarios: 'ADMIN', estados: {},
    mensagem: rec.nome_completo + ' já tinha recebido cesta em ' + String(ant.data).slice(0, 10) + ' (por ' + (ant.por || '?') + '); ' + u.login + ' liberou outra hoje' + (q.motivo_repetido ? '. Motivo: ' + q.motivo_repetido : '') });
}
const TITULOS_AL = { VALIDADE: 'Validade de produto', LIMPEZA: 'Limpeza das prateleiras', ESTOQUE_BAIXO: 'Estoque baixo', RECEBEDOR_REPETIDO: 'Cesta repetida no mês', PERSONALIZADO: 'Aviso do administrador', PEDIDO_SENHA: 'Pedido de nova senha', SENHA_REDEFINIDA: 'Senha redefinida' };
function alertaVisivel(a, u) {
  const d = String(a.destinatarios || 'TODOS');
  if (d.toUpperCase() === 'TODOS') return true;
  if (d.toUpperCase() === 'ADMIN') return u.papel === 'ADMIN';
  return d.toLowerCase().split(',').map(x => x.trim()).includes(u.login);
}
const semAcentoD = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const publicas = ['login', 'logout', 'sessao', 'solicitar_acesso', 'pedir_nova_senha'];

const ROTAS = {
  login: (b, q) => {
    const u = b.usuarios.find(x => x.login === String(q.login || '').toLowerCase());
    if (!u || q.senha !== u.senha) return { ok: false, error: 'Usuário ou senha incorretos (demo: rogerio / demo)' };
    if (!u.ativo) return { ok: false, error: 'Este acesso está desativado' };
    u.ultimo_login = agora();
    log(b, u.login, 'LOGIN', 'entrou no sistema');
    return { ok: true, token: 'demo:' + u.login, expira_em: new Date(Date.now() + 12 * 3600e3).toISOString(),
      usuario: { login: u.login, nome: u.nome_completo, papel: u.papel, admin: u.papel === 'ADMIN' }, deve_trocar_senha: !!u.forcar_troca_senha };
  },
  logout: () => ({ ok: true }),
  sessao: (b, q) => {
    const u = b.usuarios.find(x => 'demo:' + x.login === q.token);
    return u ? { ok: true, usuario: { login: u.login, nome: u.nome_completo, papel: u.papel, admin: u.papel === 'ADMIN' }, token: q.token, expira_em: new Date(Date.now() + 12 * 3600e3).toISOString() } : { ok: false, error: 'sessao invalida' };
  },
  trocar_senha: (b, q, u) => { const x = b.usuarios.find(z => z.login === u.login); if (x) { x.forcar_troca_senha = false; x.senha = q.senha_nova || q.nova_senha || x.senha; } return { ok: true }; },
  solicitar_acesso: (b, q) => {
    b.solicitacoes.unshift({ id_solicitacao: 'SOL-' + Date.now().toString(36), nome_completo: q.nome_completo || q.nome || '(sem nome)', telefone: q.telefone || '', email: q.email || '', motivo: q.motivo || '', login_sugerido: q.login_sugerido || q.login || '', status: 'PENDENTE', timestamp: agora(), observacao: '', resolvido_por: '', resolvido_em: '' });
    return { ok: true };
  },

  // "Esqueci minha senha" (D24): senha escolhida pela pessoa fica guardada até o ADM aprovar.
  pedir_nova_senha: (b, q) => {
    const login = String(q.login || '').toLowerCase().trim();
    const tel = String(q.telefone || '').replace(/\D+/g, '');
    if (!login || tel.length < 10 || String(q.senha_nova || '').length < 8) return { ok: false, error: 'Preencha usuário, telefone (com DDD) e a senha nova (ao menos 8 caracteres)' };
    const resp = { ok: true, mensagem: 'Pedido enviado. Quando o administrador aprovar, entre com a senha nova que você escolheu.' };
    const x = b.usuarios.find(z => z.login === login && z.ativo);
    if (!x) return resp;
    b.solicitacoes.filter(s => s.tipo === 'RESET' && s.status === 'PENDENTE' && s.login_sugerido === login).forEach(s => { s.status = 'SUBSTITUIDA'; s.senha_nova = ''; });
    const id = 'SOL-' + Date.now().toString(36).toUpperCase();
    b.solicitacoes.unshift({ id_solicitacao: id, tipo: 'RESET', nome_completo: x.nome_completo, telefone: tel, email: '', motivo: 'Esqueci minha senha', login_sugerido: login, status: 'PENDENTE', timestamp: agora(), observacao: 'telefone não conferido (modo demo)', resolvido_por: '', resolvido_em: '', senha_nova: q.senha_nova });
    b.alertas.unshift({ id_alerta: 'AL-S' + Date.now().toString(36), severidade: 'AVISO', tipo: 'PEDIDO_SENHA', produto_id: id, produto: '', resolvido: false, data_disparo: dia(0), criado_em: agora(), origem: 'SISTEMA', destinatarios: 'ADMIN', estados: {},
      titulo: 'Pedido de nova senha', mensagem: x.nome_completo + ' (' + login + ') pediu uma senha nova.', detalhes: 'Abra Admin → Solicitações para aprovar ou recusar.' });
    return resp;
  },

  // Números em R$ do resumo do Painel (D24) — mesmo contrato do Backend.js (impactoNCC), com os preços do demo.
  impacto: (b) => {
    const prods = {}; b.produtos.forEach(p => { prods[p.id_produto] = p; });
    const preco = (id) => Number((prods[id] || {}).preco_estimado) || 0;
    const kgDe = (id, q, un) => { const x = String(un || (prods[id] || {}).unidade || '').toLowerCase(); return x === 'kg' ? Number(q) || 0 : x === 'g' ? (Number(q) || 0) / 1000 : 0; };
    const r2 = (n) => Math.round(n * 100) / 100;
    const receita = b.itens.filter(i => i.ativo);
    const itensCesta = receita.map(i => ({ nome: i.nome, qtd: i.qtd, unidade: i.unidade, valor: r2(i.qtd * preco(i.produto_id)) })).sort((x, y) => y.valor - x.valor);
    const valorCesta = r2(itensCesta.reduce((t, i) => t + i.valor, 0));
    const kgCesta = Math.round(receita.reduce((t, i) => t + kgDe(i.produto_id, i.qtd, i.unidade), 0) * 10) / 10;
    const k = kpis(b), possiveis = k.cestas_possiveis || 0;
    let falta = 0; (k.saldo || []).forEach(sd => { const f = sd.qtd_cesta * (possiveis + 1) - sd.disponivel; if (f > 0) falta += f * preco(sd.produto_id); });
    let vEst = 0, kgEst = 0; ativos(b).forEach(l => { vEst += (Number(l.qtd) || 0) * preco(l.produto_id); kgEst += kgDe(l.produto_id, l.qtd, l.unidade); });
    const ano = dia(0).slice(0, 4), porMes = {};
    const noMes = (m) => (porMes[m] = porMes[m] || { mes: m, entregue: 0, doado: 0, comprado: 0, cestas: 0 });
    let ent = 0, entKg = 0, entAno = 0, doado = 0, comprado = 0, nCestas = 0, nAno = 0; const fam = new Set();
    b.movimentos.forEach(m => {
      const mes = String(m.timestamp).slice(0, 7); if (!mes) return; const M = noMes(mes);
      if (m.tipo === 'CESTA' && !/Embalada/.test(m.observacao || '')) { ent += valorCesta; entKg += kgCesta; M.entregue += valorCesta; M.cestas++; nCestas++; if (mes.startsWith(ano)) { entAno += valorCesta; nAno++; } if (m.destinatario) fam.add(m.recebedor_id || m.destinatario); }
      else if (m.tipo === 'SAIDA') { const v = (Number(m.qtd) || 0) * preco(m.produto_id); ent += v; entKg += kgDe(m.produto_id, m.qtd, m.unidade); M.entregue += v; if (mes.startsWith(ano)) entAno += v; }
      else if (m.tipo === 'ENTRADA') { const v = (Number(m.qtd) || 0) * preco(m.produto_id); if (m.origem === 'COMPRA') { comprado += v; M.comprado += v; } else if (m.origem !== 'LEVANTAMENTO') { doado += v; M.doado += v; } }
    });
    const meses = Object.keys(porMes).sort().slice(-12).map(m => ({ mes: m, entregue: r2(porMes[m].entregue), doado: r2(porMes[m].doado), comprado: r2(porMes[m].comprado), cestas: porMes[m].cestas }));
    return { ok: true, valor_cesta: valorCesta, kg_cesta: kgCesta, itens_cesta: itensCesta, cestas_possiveis: possiveis, falta_proxima_reais: r2(falta),
      estoque: { valor: r2(vEst), kg: Math.round(kgEst) }, entregue: { valor: r2(ent), kg: Math.round(entKg), valor_ano: r2(entAno) },
      cestas: { total: nCestas, ano: nAno }, familias: fam.size, recebido: { doado: r2(doado), comprado: r2(comprado) }, meses,
      precos_atualizados_em: agora(), ano, gerado_em: agora() };
  },
  precos_atualizar: () => ({ ok: true, produtos: 16, ibge: 'modo demo (sem consulta)' }),

  kpis: (b) => kpis(b),
  painel_linhas: (b) => painelLinhas(b),
  painel_config_salvar: (b, q, u) => {
    if (!u || u.papel !== 'ADMIN') return { ok: false, error: 'Só o admin pode salvar o painel' };
    let cfg = q.config;
    if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch (e) { return { ok: false, error: 'Configuração inválida' }; } }
    if (!cfg || !Array.isArray(cfg.graficos) || !cfg.graficos.length) return { ok: false, error: 'Precisa de pelo menos 1 gráfico' };
    b.config = cfg;
    log(b, u.login, 'PAINEL_CONFIG', 'alterou os gráficos da aba Início');
    return { ok: true, config: painelConfig(b) };
  },

  alertas_listar: (b, q, u) => {
    const ord = { URGENTE: 0, AVISO: 1, INFO: 2 };
    const itens = b.alertas.filter(a => !a.resolvido && alertaVisivel(a, u) && !(a.expira_em && a.expira_em < dia(0))).map(a => {
      const e = { vista_em: '', clicada_em: '', reconhecida_em: '', ignorada_em: '', ...(a.estados[u.login] || {}) };
      return { ...a, titulo: a.titulo || TITULOS_AL[a.tipo] || a.tipo, detalhes: a.detalhes || '', obrigatoria: !!a.obrigatoria, criado_por: a.criado_por || '',
        destinatarios: u.papel === 'ADMIN' ? a.destinatarios : undefined, estado: e, lido: !!e.vista_em, estados: undefined };
    });
    const pend = (x) => (x.estado.reconhecida_em || x.estado.ignorada_em) ? 1 : 0;
    itens.sort((x, y) => pend(x) - pend(y) || (ord[x.severidade] ?? 9) - (ord[y.severidade] ?? 9) || String(y.criado_em).localeCompare(String(x.criado_em)));
    return { ok: true, alertas: itens, nao_lidas: itens.filter(x => !x.estado.vista_em).length, obrigatorias_pendentes: itens.filter(x => x.obrigatoria && !x.estado.reconhecida_em).map(x => x.id_alerta) };
  },
  alertas_lido: (b, q, u) => ROTAS.alerta_marcar(b, { ...q, estado: 'vista' }, u),
  alerta_marcar: (b, q, u) => {
    const a = b.alertas.find(x => x.id_alerta === q.id_alerta);
    if (!a || !alertaVisivel(a, u)) return { ok: false, error: 'alerta não encontrado' };
    if (!['vista', 'clicada', 'reconhecida', 'ignorada'].includes(q.estado)) return { ok: false, error: 'estado inválido' };
    if (q.estado === 'ignorada' && a.obrigatoria) return { ok: false, error: 'leitura obrigatória: só dá para reconhecer' };
    const e = (a.estados[u.login] = a.estados[u.login] || {});
    const col = q.estado + '_em';
    if (e[col]) return { ok: true, id_alerta: a.id_alerta, estado: q.estado, acao: 'ja_marcada', em: e[col] };
    e[col] = agora();
    if (q.estado !== 'clicada' && q.estado !== 'vista' && !e.vista_em) e.vista_em = e[col];
    if (q.estado === 'reconhecida' || q.estado === 'ignorada') log(b, u.login, 'ALERTA_' + q.estado.toUpperCase(), a.titulo || a.mensagem);
    return { ok: true, id_alerta: a.id_alerta, estado: q.estado, em: e[col] };
  },
  alerta_criar: (b, q, u) => {
    const titulo = String(q.titulo || '').trim();
    if (!titulo) return { ok: false, error: 'título obrigatório' };
    const sev = String(q.severidade || 'INFO').toUpperCase();
    if (!['INFO', 'AVISO', 'URGENTE'].includes(sev)) return { ok: false, error: 'severidade deve ser INFO, AVISO ou URGENTE' };
    if (q.expira_em && q.expira_em < dia(0)) return { ok: false, error: 'a validade já passou' };
    let dest = String(q.destinatarios || 'TODOS');
    if (!['TODOS', 'ADMIN'].includes(dest.toUpperCase())) {
      const logins = dest.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      const ruim = logins.filter(l => !b.usuarios.some(x => x.login === l && x.ativo));
      if (!logins.length || ruim.length) return { ok: false, error: 'usuário(s) não encontrado(s): ' + (ruim.join(', ') || '—') };
      dest = logins.join(',');
    } else dest = dest.toUpperCase();
    const id = 'AL-' + Date.now().toString(36);
    b.alertas.unshift({ id_alerta: id, tipo: 'PERSONALIZADO', produto: '', titulo, mensagem: titulo, detalhes: String(q.detalhes || '').trim(), severidade: sev,
      data_disparo: dia(0), criado_em: agora(), resolvido: false, origem: 'ADM', criado_por: u.login, destinatarios: dest, obrigatoria: q.obrigatoria === true || q.obrigatoria === 'true', expira_em: q.expira_em || '', estados: {} });
    log(b, u.login, 'ALERTA_CRIAR', titulo);
    return { ok: true, id_alerta: id, destinatarios: dest };
  },
  alerta_retorno: (b, q) => {
    const pessoasDe = (a) => b.usuarios.filter(x => x.ativo && alertaVisivel(a, x)).map(x => ({ login: x.login, nome: x.nome_completo || x.login, papel: x.papel,
      vista_em: '', clicada_em: '', reconhecida_em: '', ignorada_em: '', ...(a.estados[x.login] || {}) }));
    if (q.id_alerta) {
      const a = b.alertas.find(x => x.id_alerta === q.id_alerta);
      return a ? { ok: true, id_alerta: a.id_alerta, titulo: a.titulo || TITULOS_AL[a.tipo] || a.tipo, pessoas: pessoasDe(a) } : { ok: false, error: 'alerta não encontrado' };
    }
    return { ok: true, alertas: b.alertas.slice(0, 60).map(a => { const p = pessoasDe(a); return { id_alerta: a.id_alerta, tipo: a.tipo, titulo: a.titulo || TITULOS_AL[a.tipo] || a.tipo,
      severidade: a.severidade, origem: a.origem || 'SISTEMA', criado_em: a.criado_em, criado_por: a.criado_por || '', resolvido: !!a.resolvido, obrigatoria: !!a.obrigatoria,
      destinatarios: a.destinatarios, total: p.length, viram: p.filter(x => x.vista_em).length, reconheceram: p.filter(x => x.reconhecida_em).length }; }) };
  },
  alertas_resolver: (b, q, u) => { const a = b.alertas.find(x => x.id_alerta === q.id_alerta); if (!a) return { ok: false, error: 'alerta não encontrado' }; a.resolvido = true; log(b, u.login, 'ALERTA_RESOLVER', a.titulo || a.mensagem); return { ok: true, id_alerta: a.id_alerta, resolvido: true }; },
  gerar_alertas: (b, q, u) => { const criados = montarAlertas(b); log(b, u.login, 'ALERTA', `gerou ${criados} alerta(s)`); return { ok: true, criados }; },
  instalar_gatilho: (b, q, u) => { log(b, u.login, 'GATILHO', 'instalou o alerta diário'); return { ok: true, mensagem: 'Gatilho diário instalado (simulado no modo demo).' }; },

  produtos_listar: (b) => ({ ok: true, produtos: b.produtos }),
  produtos_manter: (b, q, u) => {
    if (q.operacao === 'criar') {
      const id = 'PROD-' + (b.produtos.length + 1);
      b.produtos.push({ id_produto: id, nome: q.nome || 'Novo produto', unidade: q.unidade || 'un', categoria: q.categoria || 'OUTRO', qtd_padrao_cesta: Number(q.qtd_padrao_cesta) || 1, unidade_cesta: q.unidade_cesta || q.unidade || 'un', preco_estimado: Number(q.preco_estimado) || 0, validade_dias_alerta: Number(q.validade_dias_alerta) || 30, ativo: true });
      log(b, u.login, 'PRODUTO', 'criou ' + id);
      return { ok: true, id_produto: id };
    }
    const p = b.produtos.find(x => x.id_produto === q.id_produto);
    if (!p) return { ok: false, error: 'Produto não encontrado' };
    if (q.operacao === 'editar') Object.assign(p, { nome: q.nome || p.nome, unidade: q.unidade || p.unidade, qtd_padrao_cesta: Number(q.qtd_padrao_cesta) || p.qtd_padrao_cesta, unidade_cesta: q.unidade_cesta || p.unidade_cesta, preco_estimado: Number(q.preco_estimado) || 0, validade_dias_alerta: Number(q.validade_dias_alerta) || p.validade_dias_alerta });
    else if (q.operacao === 'ativar') p.ativo = true;
    else if (q.operacao === 'desativar') p.ativo = false;
    log(b, u.login, 'PRODUTO', q.operacao + ' ' + p.id_produto);
    return { ok: true };
  },

  estoque_listar: (b, q) => ({
    ok: true,
    lotes: b.lotes.filter(l => { const f = q.situacao === undefined ? 'ATIVO' : q.situacao; return !f || l.situacao === f; })
      .sort((x, y) => String(x.validade).localeCompare(String(y.validade)))
  }),
  estoque_receber: (b, q, u) => {
    let p = b.produtos.find(x => x.id_produto === q.produto_id);
    let criado = false;
    if (!p && q.produto_novo_nome) {
      // mesmo contrato do Backend.js: nome novo vira produto do catálogo (fora da receita)
      const nome = String(q.produto_novo_nome).trim();
      if (!q.unidade) return { ok: false, error: 'informe a unidade do produto novo (kg, un, pacote…)' };
      p = b.produtos.find(x => x.nome.toLowerCase() === nome.toLowerCase());
      if (!p) {
        p = { id_produto: 'PROD-' + Date.now().toString(36), nome, unidade: q.unidade, categoria: q.categoria || 'OUTRO', ativo: true, local: q.local || '' };
        b.produtos.push(p); criado = true;
        log(b, u.login, 'PRODUTO_NOVO', nome);
      }
    }
    const qtd = Number(q.qtd);
    if (!p) return { ok: false, error: 'Escolha o produto' };
    if (!(qtd > 0)) return { ok: false, error: 'Informe uma quantidade maior que zero' };
    b.lotes.push({ id_lote: 'LOTE-' + Date.now().toString(36), produto_id: p.id_produto, produto: p.nome, unidade: p.unidade, qtd, validade: q.validade || '', local: q.local || p.local || '', doador: q.doador || '', lote: q.lote || '', data_entrada: dia(0), situacao: 'ATIVO' });
    b.movimentos.unshift({ timestamp: agora(), tipo: 'ENTRADA', produto_id: p.id_produto, produto: p.nome, qtd, unidade: p.unidade, local: q.local || p.local, quem: u.nome_completo || u.login, observacao: q.doador || '', origem: q.origem === 'COMPRA' ? 'COMPRA' : 'DOACAO' });
    log(b, u.login, 'MOVIMENTO', 'entrada de ' + p.nome);
    return { ok: true, produto: p.nome, produto_id: p.id_produto, produto_criado: criado, qtd, unidade: p.unidade };
  },

  // ---- levantamento do estoque (contagem por prateleira) ----
  levantamento_status: (b) => {
    const locais = [];
    for (let n = 1; n <= 6; n++) ['T' + n, 'P' + n + '-A', 'P' + n + '-B', 'P' + n + '-C'].forEach(l => {
      const m = b.levantamento[l];
      locais.push({ local: l, lotes: ativos(b).filter(x => (x.local || '').toUpperCase() === l).length, concluido: !!m, concluido_em: m ? m.em : '', concluido_por: m ? m.por : '' });
    });
    return { ok: true, locais, sem_endereco: ativos(b).filter(x => !x.local).length, concluidos: locais.filter(x => x.concluido).length, total: locais.length };
  },
  levantamento_salvar: (b, q, u) => {
    const local = String(q.local || '').toUpperCase();
    if (!/^P[1-6]-[ABC]$|^T[1-6]$/.test(local)) return { ok: false, error: 'escolha o endereço (P1-A…P6-C ou T1…T6)' };
    let lista = [];
    try { lista = q.itens_json ? (typeof q.itens_json === 'string' ? JSON.parse(q.itens_json) : q.itens_json) : []; } catch (e) { return { ok: false, error: 'itens inválidos' }; }
    const concluir = q.concluir === true || q.concluir === 'true';
    if (!lista.length && !concluir) return { ok: false, error: 'lance pelo menos 1 item ou marque a prateleira como conferida' };
    const prontos = [];
    for (let i = 0; i < lista.length; i++) {
      const x = lista[i], n = 'item ' + (i + 1) + ': ';
      if (!(Number(x.qtd) > 0)) return { ok: false, error: n + 'quantidade deve ser maior que zero' };
      if (x.validade && !/^\d{4}-\d{2}-\d{2}$/.test(x.validade)) return { ok: false, error: n + 'validade deve estar em AAAA-MM-DD' };
      let p = b.produtos.find(z => z.id_produto === x.produto_id);
      if (!p && !x.produto_id) {
        const nome = String(x.produto_novo_nome || '').trim();
        if (!nome) return { ok: false, error: n + 'escolha o produto' };
        p = b.produtos.find(z => z.nome.toLowerCase() === nome.toLowerCase());
        if (!p && !x.unidade) return { ok: false, error: n + 'informe a unidade do produto novo (kg, un, pacote…)' };
      } else if (!p) return { ok: false, error: n + 'produto não encontrado' };
      prontos.push({ x, p });
    }
    let novos = 0;
    prontos.forEach(({ x, p }, i) => {
      if (!p) { p = { id_produto: 'PROD-' + Date.now().toString(36) + i, nome: String(x.produto_novo_nome).trim(), unidade: x.unidade, categoria: x.categoria || 'OUTRO', ativo: true, local: '' }; b.produtos.push(p); novos++; }
      b.lotes.push({ id_lote: 'LOTE-' + Date.now().toString(36) + i, produto_id: p.id_produto, produto: p.nome, unidade: x.unidade || p.unidade, qtd: Number(x.qtd), validade: x.validade || '', local, doador: 'Levantamento inicial', lote: '', data_entrada: agora(), situacao: 'ATIVO' });
      b.movimentos.unshift({ timestamp: agora(), tipo: 'ENTRADA', produto_id: p.id_produto, produto: p.nome, qtd: Number(x.qtd), unidade: x.unidade || p.unidade, local, quem: u.nome_completo || u.login, observacao: 'Levantamento inicial' });
    });
    if (concluir) b.levantamento[local] = { em: agora(), por: u.login };
    log(b, u.login, 'LEVANTAMENTO', local + ': ' + prontos.length + ' item(ns)' + (concluir ? ' · conferida' : ''));
    return { ok: true, local, lotes_criados: prontos.length, produtos_novos: novos, concluido: concluir };
  },
  estoque_corrigir: (b, q, u) => {
    const l = b.lotes.find(x => x.id_lote === q.id_lote && x.situacao === 'ATIVO');
    if (!l) return { ok: false, error: 'lote não encontrado' };
    if (q.qtd_nova === undefined || q.qtd_nova === '' || !(Number(q.qtd_nova) >= 0)) return { ok: false, error: 'informe a quantidade contada (0 ou mais)' };
    const antes = Number(l.qtd), depois = Math.round(Number(q.qtd_nova) * 1000) / 1000;
    if (antes === depois) return { ok: true, id_lote: l.id_lote, antes, depois, sem_mudanca: true };
    l.qtd = depois;
    if (depois <= 0) l.situacao = 'DESCARTADO';
    b.movimentos.unshift({ timestamp: agora(), tipo: 'AJUSTE', produto_id: l.produto_id, produto: l.produto, qtd: Math.abs(depois - antes), unidade: l.unidade, local: l.local, quem: u.nome_completo || u.login, observacao: 'Contagem: ' + antes + ' → ' + depois + (q.observacao ? ' — ' + q.observacao : '') });
    log(b, u.login, 'AJUSTE', l.produto + ': ' + antes + ' → ' + depois);
    return { ok: true, id_lote: l.id_lote, antes, depois };
  },
  levantamento_reabrir: (b, q) => {
    const l = String(q.local || '').toUpperCase();
    if (!b.levantamento[l]) return { ok: false, error: 'esse endereço não foi marcado como conferido' };
    delete b.levantamento[l];
    return { ok: true, local: l };
  },

  estoque_baixa: (b, q, u) => {
    const motivos = ['RASGADO', 'MOFADO', 'ESTRAGADO', 'VENCIDO', 'AVARIADO', 'OUTRO'];
    const motivo = String(q.motivo || '').toUpperCase();
    if (!motivos.includes(motivo)) return { ok: false, error: 'escolha o motivo da baixa' };
    if (motivo === 'OUTRO' && !q.observacao) return { ok: false, error: 'descreva o motivo' };
    const l = b.lotes.find(x => x.id_lote === q.id_lote && x.situacao === 'ATIVO');
    if (!l) return { ok: false, error: 'lote não encontrado' };
    const qtd = q.qtd === undefined || q.qtd === '' ? Number(l.qtd) : Number(q.qtd);
    if (!(qtd > 0) || qtd > Number(l.qtd)) return { ok: false, error: 'quantidade deve ser entre 0 e ' + l.qtd };
    l.qtd = Math.round((Number(l.qtd) - qtd) * 1000) / 1000;
    if (l.qtd <= 0) l.situacao = 'DESCARTADO';
    b.movimentos.unshift({ timestamp: agora(), tipo: 'DESCARTE', produto_id: l.produto_id, produto: l.produto, qtd, unidade: l.unidade, local: l.local, quem: u.nome_completo || u.login, observacao: 'Motivo: ' + motivo.toLowerCase() + (q.observacao ? ' — ' + q.observacao : '') });
    log(b, u.login, 'DESCARTE', l.produto + ' (' + motivo.toLowerCase() + ')');
    return { ok: true, id_lote: l.id_lote, qtd, resto: l.qtd, motivo };
  },

  estoque_mover: (b, q, u) => {
    const destino = String(q.local_destino || '').toUpperCase();
    if (!/^P[1-6]-[ABC]$|^T[1-6]$/.test(destino)) return { ok: false, error: 'escolha o local de destino' };
    const motivo = String(q.motivo || '').toUpperCase();
    if (!['ORGANIZACAO', 'LIMPEZA', 'QUANTIDADE', 'OUTRO'].includes(motivo)) return { ok: false, error: 'escolha o motivo da mudança' };
    const l = b.lotes.find(x => x.id_lote === q.id_lote && x.situacao === 'ATIVO');
    if (!l) return { ok: false, error: 'lote não encontrado' };
    if (String(l.local).toUpperCase() === destino) return { ok: false, error: 'o lote já está em ' + destino };
    const qtd = q.qtd === undefined || q.qtd === '' ? Number(l.qtd) : Number(q.qtd);
    if (!(qtd > 0) || qtd > Number(l.qtd)) return { ok: false, error: 'quantidade deve ser entre 0 e ' + l.qtd };
    const origem = l.local;
    let id = l.id_lote;
    if (qtd >= Number(l.qtd)) l.local = destino;
    else {
      l.qtd = Math.round((Number(l.qtd) - qtd) * 1000) / 1000;
      id = 'LOTE-' + Date.now().toString(36);
      b.lotes.push(Object.assign({}, l, { id_lote: id, qtd, local: destino }));
    }
    b.movimentos.unshift({ timestamp: agora(), tipo: 'TRANSFERENCIA', produto_id: l.produto_id, produto: l.produto, qtd, unidade: l.unidade, local: (origem || '—') + ' → ' + destino, quem: u.nome_completo || u.login, observacao: 'Motivo: ' + motivo.toLowerCase() + (q.observacao ? ' — ' + q.observacao : '') });
    log(b, u.login, 'TRANSFERENCIA', l.produto + ' ' + origem + ' → ' + destino);
    return { ok: true, id_lote: id, origem, destino, qtd };
  },

  cesta_listar: (b) => {
    const k = kpis(b);
    return { ok: true, itens: b.itens.map(i => ({ ...i, cestas_cabem: (k.saldo.find(s => s.produto_id === i.produto_id) || {}).cestas_cabem })) };
  },
  cestas_listar: (b, q) => {
    const todas = b.cestas.map(c => ({ ...c, status: c.status || 'ENTREGUE' }));
    const filtro = String(q.status || '').toUpperCase();
    return { ok: true, cestas: filtro ? todas.filter(c => c.status === filtro) : todas.slice(0, q.limite || 10) };
  },
  cesta_editar: (b, q, u) => {
    if (!u || u.papel !== 'ADMIN') return { ok: false, error: 'Só o admin edita a receita' };
    if (q.operacao === 'adicionar') {
      const p = b.produtos.find(x => x.id_produto === q.produto_id);
      if (!p) return { ok: false, error: 'Escolha um produto' };
      b.itens.push({ id_item: 'CI-' + Date.now().toString(36), produto_id: p.id_produto, nome: p.nome, qtd: Number(q.qtd) || 0, unidade: q.unidade || p.unidade, ativo: true });
      log(b, u.login, 'CESTA', 'adicionou ' + p.nome + ' à receita');
      return { ok: true };
    }
    const it = b.itens.find(x => x.id_item === q.id_item);
    if (!it) return { ok: false, error: 'Item não encontrado' };
    if (q.operacao === 'editar') { it.qtd = Number(q.qtd) || it.qtd; it.unidade = q.unidade || it.unidade; }
    else if (q.operacao === 'desativar') it.ativo = false;
    else if (q.operacao === 'ativar') it.ativo = true;
    log(b, u.login, 'CESTA', q.operacao + ' item ' + it.nome);
    return { ok: true };
  },
  cesta_montar: (b, q, u) => {
    const destino = String(q.destino || '').toUpperCase() === 'EMBALADA' ? 'EMBALADA' : 'ENTREGUE';
    let dest = String(q.destinatario || '').trim();
    let rec = null, repetido = null;
    if (destino === 'ENTREGUE' && q.recebedor_id) {
      const rr = resolverRecDemo(b, q);
      if (rr.resp) return rr.resp;
      rec = rr.rec; repetido = rr.repetido; dest = rr.nome;
    }
    if (destino === 'ENTREGUE' && !dest) return { ok: false, error: 'Informe para quem é a cesta' };
    let itens;
    const personalizada = !!q.itens_json;
    if (personalizada) {
      itens = JSON.parse(q.itens_json).map(x => ({ produto_id: x.produto_id, qtd: Number(x.qtd), unidade: x.unidade || unidadeDe(b, x.produto_id) }));
      if (!itens.length || itens.some(i => !(i.qtd > 0))) return { ok: false, error: 'escolha os itens e quantidades' };
    } else itens = b.itens.filter(i => i.ativo).map(i => ({ produto_id: i.produto_id, qtd: Number(i.qtd), unidade: i.unidade }));
    const faltas = faltasDemo(b, itens);
    if (faltas.length) return { ok: false, error: 'Estoque insuficiente. Faltam: ' + faltas.join('; ') };
    itens.forEach(i => baixarFIFO(b, i.produto_id, i.qtd));
    const quem = u.nome_completo || u.login;
    const id = 'CESTA-MONTADA-' + Date.now().toString(36);
    b.cestas.unshift({ id_cesta: id, timestamp: agora(), destinatario: dest, observacao: q.observacao || '', qtd_itens: itens.length, montada_por: quem,
      recebedor_id: rec ? rec.id_recebedor : '', status: destino, personalizada, local: destino === 'EMBALADA' ? (q.local || '') : '', entregue_em: destino === 'ENTREGUE' ? agora() : '', entregue_por: destino === 'ENTREGUE' ? quem : '',
      itens: itens.map(i => ({ ...i, nome: nomeDe(b, i.produto_id) })) });
    b.movimentos.unshift({ timestamp: agora(), tipo: 'CESTA', destinatario: dest, qtd: itens.length, unidade: 'itens', quem, recebedor_id: rec ? rec.id_recebedor : '', local: destino === 'EMBALADA' ? (q.local || '') : '', observacao: (destino === 'EMBALADA' ? 'Embalada p/ estoque. ' : '') + (personalizada ? 'Personalizada. ' : '') + (q.observacao || '') });
    log(b, u.login, 'CESTA_MONTAR', destino === 'EMBALADA' ? 'cesta embalada' : 'cesta para ' + dest);
    if (repetido) alertaRepetidoDemo(b, rec, repetido, u, q);
    return { ok: true, id_cesta: id, destinatario: dest, status: destino, personalizada, qtd_itens: itens.length };
  },

  cesta_entregar: (b, q, u) => {
    let dest = String(q.destinatario || '').trim();
    let rec = null, repetido = null;
    if (q.recebedor_id) {
      const rr = resolverRecDemo(b, q);
      if (rr.resp) return rr.resp;
      rec = rr.rec; repetido = rr.repetido; dest = rr.nome;
    }
    if (!dest) return { ok: false, error: 'Informe para quem é a cesta' };
    const c = b.cestas.find(x => x.id_cesta === q.id_cesta);
    if (!c) return { ok: false, error: 'cesta não encontrada' };
    if ((c.status || 'ENTREGUE') !== 'EMBALADA') return { ok: false, error: 'esta cesta já foi entregue' };
    const quem = u.nome_completo || u.login;
    Object.assign(c, { status: 'ENTREGUE', destinatario: dest, entregue_em: agora(), entregue_por: quem, recebedor_id: rec ? rec.id_recebedor : '' });
    b.movimentos.unshift({ timestamp: agora(), tipo: 'ENTREGA', destinatario: dest, qtd: 1, unidade: 'cesta', quem, recebedor_id: rec ? rec.id_recebedor : '', observacao: q.observacao || 'Cesta embalada entregue' });
    log(b, u.login, 'ENTREGA', 'cesta embalada para ' + dest);
    if (repetido) alertaRepetidoDemo(b, rec, repetido, u, q);
    return { ok: true, id_cesta: c.id_cesta, destinatario: dest };
  },

  entrega_avulsa: (b, q, u) => {
    let dest = String(q.destinatario || '').trim();
    let recId = '';
    if (q.recebedor_id) {
      const r0 = b.recebedores.find(x => x.id_recebedor === q.recebedor_id);
      if (!r0) return { ok: false, error: 'recebedor não encontrado' };
      dest = r0.nome_completo; recId = r0.id_recebedor;
    }
    if (!dest) return { ok: false, error: 'Informe para quem é a entrega' };
    let itens;
    try { itens = JSON.parse(q.itens_json || '[]').map(x => ({ produto_id: x.produto_id, qtd: Number(x.qtd), unidade: x.unidade || unidadeDe(b, x.produto_id) })); } catch (e) { itens = []; }
    if (!itens.length || itens.some(i => !(i.qtd > 0))) return { ok: false, error: 'escolha pelo menos um item' };
    const faltas = faltasDemo(b, itens);
    if (faltas.length) return { ok: false, error: 'Estoque insuficiente. Faltam: ' + faltas.join('; ') };
    const quem = u.nome_completo || u.login;
    itens.forEach(i => {
      baixarFIFO(b, i.produto_id, i.qtd);
      b.movimentos.unshift({ timestamp: agora(), tipo: 'SAIDA', produto_id: i.produto_id, produto: nomeDe(b, i.produto_id), qtd: i.qtd, unidade: i.unidade, destinatario: dest, quem, recebedor_id: recId, observacao: ('Entrega avulsa. ' + (q.observacao || '')).trim() });
    });
    log(b, u.login, 'SAIDA', 'entrega avulsa para ' + dest);
    return { ok: true, destinatario: dest, qtd_itens: itens.length };
  },
  // ---- recebedores ----
  recebedor_listar: (b, q, u) => ({ ok: true, recebedores: b.recebedores
    .filter(r => r.ativo || (u.papel === 'ADMIN' && q.incluir_inativos))
    .map(r => recDto(b, r)).sort((x, y) => semAcentoD(x.nome_completo).localeCompare(semAcentoD(y.nome_completo))) }),
  recebedor_historico: (b, q) => {
    const r = b.recebedores.find(x => x.id_recebedor === q.id_recebedor);
    return r ? { ok: true, recebedor: recDto(b, r), entregas: entregasDe(b, r.id_recebedor).slice(0, 200) } : { ok: false, error: 'recebedor não encontrado' };
  },
  recebedor_salvar: (b, q, u) => {
    const nome = String(q.nome_completo || '').trim().replace(/\s+/g, ' ');
    if (!nome) return { ok: false, error: 'nome completo obrigatório' };
    if (nome.split(' ').length < 2) return { ok: false, error: 'use o nome COMPLETO (nome e sobrenome) para diferenciar de outras pessoas' };
    const email = String(q.email || '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'e-mail inválido' };
    const igual = b.recebedores.find(r => semAcentoD(r.nome_completo) === semAcentoD(nome) && r.id_recebedor !== q.id_recebedor);
    if (igual && !((q.forcar_homonimo === true || q.forcar_homonimo === 'true') && String(q.observacao || '').trim())) {
      return { ok: false, duplicado: true, id_existente: igual.id_recebedor, error: 'Já existe "' + igual.nome_completo + '" (' + igual.id_recebedor + '). Se for outra pessoa com o mesmo nome, escreva uma observação que diferencie (ex.: rua/filho de) e confirme.' };
    }
    const campos = { nome_completo: nome, telefone: String(q.telefone || '').trim(), endereco: String(q.endereco || '').trim(), email, observacao: String(q.observacao || '').trim() };
    if (q.id_recebedor) {
      const r = b.recebedores.find(x => x.id_recebedor === q.id_recebedor);
      if (!r) return { ok: false, error: 'recebedor não encontrado' };
      Object.assign(r, campos);
      log(b, u.login, 'RECEBEDOR', 'editou ' + nome);
      return { ok: true, id_recebedor: r.id_recebedor, criado: false, nome_completo: nome };
    }
    const id = 'REC-' + String(b.recebedores.length + 1).padStart(4, '0');
    b.recebedores.push({ id_recebedor: id, ...campos, ativo: true, criado_em: agora(), criado_por: u.login });
    log(b, u.login, 'RECEBEDOR', 'cadastrou ' + nome);
    return { ok: true, id_recebedor: id, criado: true, nome_completo: nome };
  },
  recebedor_inativar: (b, q, u) => {
    const r = b.recebedores.find(x => x.id_recebedor === q.id_recebedor);
    if (!r) return { ok: false, error: 'recebedor não encontrado' };
    r.ativo = q.ativo === undefined ? false : (q.ativo === true || q.ativo === 'true');
    log(b, u.login, 'RECEBEDOR', (r.ativo ? 'reativou ' : 'inativou ') + r.nome_completo);
    return { ok: true, id_recebedor: r.id_recebedor, ativo: r.ativo };
  },

  // ---- escala de voluntários ----
  conv_listar: (b, q, u) => ({ ok: true, convocacoes: b.convocacoes
    .filter(c => c.status === 'ABERTA' || (q.incluir_fechadas && c.status === 'FECHADA'))
    .sort((x, y) => (x.data + x.hora).localeCompare(y.data + y.hora))
    .map(c => ({ ...c, vagas: c.vagas.map(v => ({ ...v, inscritos: v.inscritos.map(i => ({ ...i, eu: !!i.usuario_login && i.usuario_login === u.login })) })) })) }),
  conv_salvar: (b, q, u) => {
    const titulo = String(q.titulo || '').trim();
    if (!titulo) return { ok: false, error: 'título obrigatório' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(q.data || ''))) return { ok: false, error: 'data deve estar em AAAA-MM-DD' };
    let lista;
    try { lista = typeof q.vagas_json === 'string' ? JSON.parse(q.vagas_json) : q.vagas_json; } catch (e) { lista = null; }
    if (!Array.isArray(lista) || !lista.length) return { ok: false, error: 'inclua ao menos 1 tarefa com vagas' };
    if (lista.some(x => !String(x.tarefa || '').trim() || !(Math.floor(Number(x.vagas_total)) >= 1 && Number(x.vagas_total) <= 50))) return { ok: false, error: 'toda tarefa precisa de nome e de 1 a 50 vagas' };
    let c = b.convocacoes.find(x => x.id_conv === q.id_conv);
    if (q.id_conv && !c) return { ok: false, error: 'convocação não encontrada' };
    const atuais = c ? c.vagas : [];
    for (const x of lista) { const v = atuais.find(a => a.id_vaga === x.id_vaga); if (v && v.inscritos.length > Number(x.vagas_total)) return { ok: false, error: 'tarefa "' + x.tarefa + '" já tem ' + v.inscritos.length + ' inscritos — remova alguém antes de reduzir as vagas' }; }
    for (const v of atuais) if (!lista.some(x => x.id_vaga === v.id_vaga) && v.inscritos.length) return { ok: false, error: 'tarefa "' + v.tarefa + '" tem inscritos — remova-os antes de apagar a tarefa' };
    if (!c) { c = { id_conv: 'CONV-' + String(b.convocacoes.length + 1).padStart(4, '0'), status: 'ABERTA', criada_por: u.login, vagas: [] }; b.convocacoes.push(c); }
    Object.assign(c, { titulo, data: q.data, hora: String(q.hora || ''), local: String(q.local || '').trim(), descricao: String(q.descricao || '').trim() });
    let n = 0;
    c.vagas = lista.map(x => {
      const v = atuais.find(a => a.id_vaga === x.id_vaga);
      return v ? { ...v, tarefa: String(x.tarefa).trim(), vagas_total: Number(x.vagas_total) }
               : { id_vaga: 'VAGA-' + Date.now().toString(36) + (n++), tarefa: String(x.tarefa).trim(), vagas_total: Number(x.vagas_total), inscritos: [] };
    });
    log(b, u.login, 'CONV', 'salvou convocação ' + titulo);
    return { ok: true, id_conv: c.id_conv };
  },
  conv_inscrever: (b, q, u) => {
    const c = b.convocacoes.find(x => x.vagas.some(v => v.id_vaga === q.id_vaga));
    const v = c && c.vagas.find(x => x.id_vaga === q.id_vaga);
    if (!v) return { ok: false, error: 'vaga não encontrada' };
    if (c.status !== 'ABERTA') return { ok: false, error: 'convocação encerrada' };
    const minha = v.inscritos.find(i => i.usuario_login === u.login);
    if (String(q.acao || '').toLowerCase() === 'sair') {
      if (!minha) return { ok: false, error: 'você não está nesta vaga' };
      v.inscritos = v.inscritos.filter(i => i !== minha);
      return { ok: true, id_insc: minha.id_insc, saiu: true };
    }
    if (minha) return { ok: false, error: 'você já está inscrito nesta tarefa' };
    if (v.inscritos.length >= v.vagas_total) return { ok: false, error: 'vagas esgotadas nesta tarefa' };
    const id = 'INSC-' + Date.now().toString(36);
    v.inscritos.push({ id_insc: id, usuario_login: u.login, nome: u.nome_completo || u.login, nome_livre: '', obs: String(q.obs || '') });
    return { ok: true, id_insc: id };
  },
  conv_preencher: (b, q, u) => {
    const c = b.convocacoes.find(x => x.vagas.some(v => v.id_vaga === q.id_vaga));
    const v = c && c.vagas.find(x => x.id_vaga === q.id_vaga);
    if (!v) return { ok: false, error: 'vaga não encontrada' };
    if (c.status !== 'ABERTA') return { ok: false, error: 'convocação encerrada' };
    const login = String(q.usuario_login || '').trim().toLowerCase();
    const livre = String(q.nome_livre || '').trim().replace(/\s+/g, ' ');
    if (!login && !livre) return { ok: false, error: 'informe um usuário ou um nome' };
    let nome = livre;
    if (login) {
      const x = b.usuarios.find(z => z.login === login && z.ativo);
      if (!x) return { ok: false, error: 'usuário não encontrado: ' + login };
      if (v.inscritos.some(i => i.usuario_login === login)) return { ok: false, error: 'esse usuário já está nesta tarefa' };
      nome = x.nome_completo || x.login;
    } else if (v.inscritos.some(i => semAcentoD(i.nome_livre) === semAcentoD(livre))) return { ok: false, error: 'esse nome já está nesta tarefa' };
    if (v.inscritos.length >= v.vagas_total) return { ok: false, error: 'vagas esgotadas — aumente as vagas da tarefa no editor' };
    const id = 'INSC-' + Date.now().toString(36);
    v.inscritos.push({ id_insc: id, usuario_login: login, nome, nome_livre: login ? '' : livre, obs: String(q.obs || '') });
    return { ok: true, id_insc: id };
  },
  conv_remover_inscricao: (b, q) => {
    for (const c of b.convocacoes) for (const v of c.vagas) { const i = v.inscritos.find(x => x.id_insc === q.id_insc); if (i) { v.inscritos = v.inscritos.filter(x => x !== i); return { ok: true, id_insc: q.id_insc }; } }
    return { ok: false, error: 'inscrição não encontrada' };
  },
  conv_status: (b, q, u) => {
    const st = String(q.status || '').toUpperCase();
    if (!['ABERTA', 'FECHADA', 'EXCLUIDA'].includes(st)) return { ok: false, error: 'status deve ser ABERTA, FECHADA ou EXCLUIDA' };
    const c = b.convocacoes.find(x => x.id_conv === q.id_conv);
    if (!c) return { ok: false, error: 'convocação não encontrada' };
    c.status = st;
    if (st === 'EXCLUIDA') b.convocacoes = b.convocacoes.filter(x => x !== c);
    return { ok: true, id_conv: q.id_conv, status: st };
  },

  movimentos_listar: (b, q) => ({ ok: true, movimentos: b.movimentos.slice(0, q.limite || 200) }),

  // ------- admin -------
  listar_solicitacoes: (b, q) => {
    const s = String(q.status || '').toUpperCase();
    const lista = (!s || s === 'TODOS') ? b.solicitacoes : b.solicitacoes.filter(x => String(x.status).toUpperCase() === s);
    return { ok: true, solicitacoes: lista.map(x => ({ ...x, senha_nova: undefined })) };
  },
  resolver_solicitacao: (b, q, u) => {
    const s = b.solicitacoes.find(x => x.id_solicitacao === q.id_solicitacao);
    if (!s) return { ok: false, error: 'Solicitação não encontrada' };
    if (s.status !== 'PENDENTE') return { ok: false, error: 'solicitação já resolvida (' + s.status + ')' };
    if (s.tipo === 'RESET') {
      b.alertas.filter(a => a.tipo === 'PEDIDO_SENHA' && a.produto_id === s.id_solicitacao).forEach(a => { a.resolvido = true; });
      if (q.acao === 'aprovar') {
        const x = b.usuarios.find(z => z.login === s.login_sugerido);
        if (!x) return { ok: false, error: 'usuário não encontrado' };
        x.senha = s.senha_nova; x.forcar_troca_senha = false;
        s.status = 'APROVADA'; s.senha_nova = ''; s.resolvido_por = u.nome_completo; s.resolvido_em = agora();
        b.alertas.unshift({ id_alerta: 'AL-P' + Date.now().toString(36), severidade: 'INFO', tipo: 'SENHA_REDEFINIDA', produto: '', resolvido: false, data_disparo: dia(0), criado_em: agora(), origem: 'SISTEMA', destinatarios: x.login, estados: {},
          titulo: 'Senha redefinida', mensagem: 'Sua senha nova foi aprovada por ' + u.login + '.', detalhes: 'Se não foi você quem pediu, avise o administrador na hora.' });
        log(b, u.login, 'SOLICITACAO', 'aprovou senha nova de ' + x.login);
        return { ok: true, tipo: 'RESET', login: x.login, senha_redefinida: true };
      }
      if (!q.observacao) return { ok: false, error: 'motivo da recusa obrigatório' };
      s.status = 'RECUSADA'; s.senha_nova = ''; s.observacao = q.observacao; s.resolvido_por = u.nome_completo; s.resolvido_em = agora();
      return { ok: true };
    }
    if (q.acao === 'aprovar') {
      const login = (s.login_sugerido || s.nome_completo.split(' ')[0]).toLowerCase().replace(/[^a-z0-9]/g, '') || 'novo';
      if (b.usuarios.some(x => x.login === login)) return { ok: false, error: 'Já existe usuário com esse login' };
      const senha = senhaTemp(Date.now());
      b.usuarios.push({ login, nome_completo: s.nome_completo, papel: q.papel || 'VOLUNTARIO', ativo: true, senha, ultimo_login: '', forcar_troca_senha: true });
      s.status = 'APROVADA'; s.resolvido_por = u.nome_completo; s.resolvido_em = agora();
      log(b, u.login, 'SOLICITACAO', 'aprovou ' + s.nome_completo + ' (login ' + login + ')');
      return { ok: true, login, senha_temporaria: senha };
    }
    s.status = 'RECUSADA'; s.observacao = q.observacao || ''; s.resolvido_por = u.nome_completo; s.resolvido_em = agora();
    log(b, u.login, 'SOLICITACAO', 'recusou ' + s.nome_completo);
    return { ok: true };
  },
  listar_usuarios_adm: (b) => ({ ok: true, usuarios: b.usuarios.map(x => ({ login: x.login, nome_completo: x.nome_completo, papel: x.papel, ativo: x.ativo, ultimo_login: x.ultimo_login, forcar_troca_senha: x.forcar_troca_senha })) }),
  criar_usuario: (b, q, u) => {
    const login = String(q.login || '').toLowerCase().trim();
    if (!login) return { ok: false, error: 'Informe o login' };
    if (b.usuarios.some(x => x.login === login)) return { ok: false, error: 'Login já existe' };
    const senha = q.senha_temporaria || senhaTemp(Date.now());
    b.usuarios.push({ login, nome_completo: q.nome_completo || login, papel: q.papel || 'VOLUNTARIO', ativo: true, senha, ultimo_login: '', forcar_troca_senha: true });
    log(b, u.login, 'USUARIO', 'criou ' + login);
    return { ok: true, login, senha_temporaria: senha };
  },
  manter_usuario: (b, q, u) => {
    const x = b.usuarios.find(z => z.login === q.login);
    if (!x) return { ok: false, error: 'Usuário não encontrado' };
    if (q.operacao === 'editar') x.papel = q.papel || x.papel;
    else if (q.operacao === 'desativar') x.ativo = false;
    else if (q.operacao === 'ativar') x.ativo = true;
    else return { ok: false, error: 'operacao deve ser ativar, desativar ou editar' };
    log(b, u.login, 'USUARIO', q.operacao + ' ' + q.login);
    return { ok: true };
  },
  config_listar: (b) => ({ ok: true, config: b.config_sistema }),
  config_definir: (b, q, u) => {
    const c = b.config_sistema.find(x => x.chave === q.chave);
    let acao = 'atualizada';
    if (c) c.valor = q.valor; else { b.config_sistema.push({ chave: q.chave, valor: q.valor, descricao: '' }); acao = 'criada'; }
    log(b, u.login, 'CONFIG', q.chave + ' = ' + q.valor);
    return { ok: true, acao };
  },
  log_auditoria: (b, q) => ({ ok: true, logs: b.logs.slice(0, q.limite || 50) }),
  saude_planilha: (b) => ({
    ok: true, schema_versao: 'demo', sessao_horas: '12',
    segredos: { NCC_PEPPER: true, NCC_SESSION_SECRET: true },
    abas: [
      { nome: 'USUARIOS', linhas: b.usuarios.length }, { nome: 'SOLICITACOES_ACESSO', linhas: b.solicitacoes.length },
      { nome: 'PRODUTOS', linhas: b.produtos.length }, { nome: 'CESTA_PADRAO', linhas: b.itens.length },
      { nome: 'ESTOQUE', linhas: b.lotes.length }, { nome: 'MOVIMENTOS', linhas: b.movimentos.length },
      { nome: 'CESTAS_MONTADAS', linhas: b.cestas.length }, { nome: 'ALERTAS', linhas: b.alertas.length },
      { nome: 'CONFIG_SISTEMA', linhas: b.config_sistema.length }, { nome: 'AUDITORIA', linhas: b.logs.length }
    ]
  })
};

export async function demoChamar(body) {
  await esperar(200 + Math.random() * 300); // imita a lentidão do Apps Script
  const b = carregar();
  const rota = ROTAS[body.action];
  if (!rota) return { ok: false, error: 'Indisponível no modo demo' };
  const u = b.usuarios.find(x => 'demo:' + x.login === body.token);
  if (!publicas.includes(body.action) && !u) return { ok: false, error: 'sessao invalida' };
  const r = rota(b, body, u) || { ok: false, error: 'sem resposta' };
  salvar();
  return r;
}

export function reiniciarDemo() {
  bd = inicial(); salvar();
}
