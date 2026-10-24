// imagem-escala.js — gera o PNG vertical (1080×1350) da escala de voluntários para postar no WhatsApp.
// Canvas nativo, sem biblioteca e sem servidor: roda no celular. Muitas tarefas → a escala reduz sozinha.

import { abrirDialogo, fecharDialogo } from './sigma-dialogo.js';

const W = 1080, H = 1350;
const COR = { papel: '#F7F1E3', verde: '#1F4739', verde2: '#2E6B52', ambar: '#E8A33D', tinta: '#2A2A26', fraca: '#6B675C', borda: '#D9CDB0', cartao: '#FFFDF8', terracota: '#C45D3C' };
const SERIF = "Fraunces, Georgia, 'Times New Roman', serif";
const SANS = "'Public Sans', system-ui, Arial, sans-serif";
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function dataExtenso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return DIAS[d.getDay()] + ', ' + Number(m[3]) + ' de ' + MESES[Number(m[2]) - 1];
}

function quebrar(ctx, texto, largura) {
  const linhas = [];
  let atual = '';
  String(texto || '').split(/\s+/).filter(Boolean).forEach(p => {
    const t = atual ? atual + ' ' + p : p;
    if (ctx.measureText(t).width > largura && atual) { linhas.push(atual); atual = p; } else atual = t;
  });
  if (atual) linhas.push(atual);
  return linhas;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Distribui as "pílulas" (nomes e vagas livres) em linhas dentro da largura. Devolve [{x,y,w,txt,livre}], altura usada.
function pilulas(ctx, itens, largura, esc) {
  const fonte = Math.round(30 * esc), alt = Math.round(56 * esc), gap = Math.round(12 * esc), pad = Math.round(22 * esc);
  ctx.font = '600 ' + fonte + 'px ' + SANS;
  const out = [];
  let x = 0, y = 0;
  itens.forEach(it => {
    let w = Math.min(largura, ctx.measureText(it.txt).width + pad * 2);
    if (x > 0 && x + w > largura) { x = 0; y += alt + gap; }
    out.push({ ...it, x, y, w, alt, fonte });
    x += w + gap;
  });
  return { out, altura: itens.length ? y + alt : 0 };
}

function montarLayout(ctx, conv, esc, larg) {
  return conv.vagas.map(v => {
    const nomes = v.inscritos.map(i => ({ txt: i.nome, livre: false }));
    const livres = Math.max(0, v.vagas_total - v.inscritos.length);
    for (let k = 0; k < Math.min(livres, 12); k++) nomes.push({ txt: 'vaga livre', livre: true });
    const p = pilulas(ctx, nomes, larg - 2 * Math.round(28 * esc), esc);
    const cab = Math.round(78 * esc);
    return { v, p, altura: cab + p.altura + Math.round(34 * esc), cab };
  });
}

// Devolve o canvas desenhado. `logo` = HTMLImageElement opcional.
export function desenharEscala(conv, logo) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = COR.papel; ctx.fillRect(0, 0, W, H);

  // cabeçalho
  ctx.fillStyle = COR.verde; ctx.fillRect(0, 0, W, 270);
  ctx.fillStyle = COR.ambar; ctx.fillRect(0, 270, W, 8);
  let xTxt = 64;
  if (logo) { ctx.save(); rr(ctx, 64, 56, 96, 96, 22); ctx.clip(); ctx.drawImage(logo, 64, 56, 96, 96); ctx.restore(); xTxt = 186; }
  ctx.fillStyle = COR.ambar; ctx.font = '600 28px ' + SANS; ctx.textBaseline = 'alphabetic';
  ctx.fillText('CONVOCAÇÃO DE VOLUNTÁRIOS', xTxt, 92);
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '400 26px ' + SANS;
  ctx.fillText('Cestas básicas · Ação solidária', xTxt, 132);
  ctx.fillStyle = '#fff'; ctx.font = '700 62px ' + SERIF;
  const tit = quebrar(ctx, conv.titulo, W - 128).slice(0, 2);
  tit.forEach((l, i) => ctx.fillText(l, 64, 214 + i * 0 + (tit.length === 2 ? i * 66 - 30 : 0)));

  // quando e onde
  const linhasInfo = [
    ['Quando', dataExtenso(conv.data) + (conv.hora ? ' · ' + conv.hora : '')],
    ...(conv.local ? [['Onde', conv.local]] : [])
  ];
  let y = 312;
  ctx.font = '600 38px ' + SANS;
  linhasInfo.forEach(([rot, val]) => {
    ctx.fillStyle = COR.verde2; ctx.font = '600 24px ' + SANS; ctx.fillText(rot.toUpperCase(), 64, y + 6);
    ctx.fillStyle = COR.tinta; ctx.font = '600 38px ' + SANS;
    const ls = quebrar(ctx, val, W - 128 - 170);
    ls.slice(0, 2).forEach((l, i) => ctx.fillText(l, 64 + 170, y + 8 + i * 46));
    y += 18 + Math.min(2, ls.length) * 46;
  });
  if (conv.descricao) {
    ctx.fillStyle = COR.fraca; ctx.font = 'italic 400 28px ' + SANS;
    quebrar(ctx, conv.descricao, W - 128).slice(0, 2).forEach((l, i) => ctx.fillText(l, 64, y + 14 + i * 36));
    y += 14 + Math.min(2, quebrar(ctx, conv.descricao, W - 128).length) * 36;
  }
  y += 26;

  // tarefas: maior escala em que tudo cabe entre y e o rodapé
  const fim = H - 110;
  const larg = W - 128;
  let esc = 1, lay = montarLayout(ctx, conv, esc, larg);
  const gap = (e) => Math.round(22 * e);
  const total = (l, e) => l.reduce((s, r) => s + r.altura, 0) + gap(e) * Math.max(0, l.length - 1);
  while (total(lay, esc) > fim - y && esc > 0.45) { esc = Math.round((esc - 0.05) * 100) / 100; lay = montarLayout(ctx, conv, esc, larg); }

  lay.forEach(({ v, p, altura, cab }) => {
    ctx.fillStyle = COR.cartao; rr(ctx, 64, y, larg, altura, 26); ctx.fill();
    ctx.strokeStyle = COR.borda; ctx.lineWidth = 2; rr(ctx, 64, y, larg, altura, 26); ctx.stroke();
    ctx.fillStyle = COR.verde; ctx.font = '700 ' + Math.round(40 * esc) + 'px ' + SERIF;
    ctx.textAlign = 'left'; ctx.fillText(v.tarefa, 64 + Math.round(28 * esc), y + Math.round(54 * esc));
    const ocup = v.inscritos.length;
    const cheio = ocup >= v.vagas_total;
    ctx.textAlign = 'right';
    ctx.fillStyle = cheio ? COR.verde2 : COR.terracota; ctx.font = '600 ' + Math.round(28 * esc) + 'px ' + SANS;
    ctx.fillText(cheio ? 'completo ✓' : ocup + ' de ' + v.vagas_total + ' vagas', 64 + larg - Math.round(28 * esc), y + Math.round(52 * esc));
    ctx.textAlign = 'left';
    p.out.forEach(it => {
      const px = 64 + Math.round(28 * esc) + it.x, py = y + cab + it.y;
      if (it.livre) {
        ctx.setLineDash([10, 8]); ctx.strokeStyle = COR.ambar; ctx.lineWidth = 3; rr(ctx, px, py, it.w, it.alt, it.alt / 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#9A6410';
      } else {
        ctx.fillStyle = COR.verde2; rr(ctx, px, py, it.w, it.alt, it.alt / 2); ctx.fill();
        ctx.fillStyle = '#fff';
      }
      ctx.font = '600 ' + it.fonte + 'px ' + SANS;
      ctx.fillText(it.txt, px + Math.round(22 * esc), py + it.alt / 2 + it.fonte * 0.35);
    });
    y += altura + gap(esc);
  });

  // rodapé
  ctx.fillStyle = COR.verde; ctx.fillRect(0, H - 84, W, 84);
  ctx.fillStyle = '#fff'; ctx.font = '500 28px ' + SANS; ctx.textAlign = 'center';
  const livresTotal = conv.vagas.reduce((s, v) => s + Math.max(0, v.vagas_total - v.inscritos.length), 0);
  ctx.fillText(livresTotal ? livresTotal + ' vaga(s) livre(s) — chame no grupo e venha ajudar!' : 'Escala completa — obrigado a todos!', W / 2, H - 34);
  ctx.textAlign = 'left';
  return cv;
}

function carregarLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = './icones/icone-192.png';
  });
}

export async function gerarImagemEscala(conv) {
  try { await Promise.all([document.fonts.load('700 40px Fraunces'), document.fonts.load('600 30px "Public Sans"')]); } catch (e) {}
  const logo = await carregarLogo();
  const cv = desenharEscala(conv, logo);
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  return { blob, canvas: cv };
}

const nomeArquivo = (conv) => 'escala-' + String(conv.data || '').slice(0, 10) + '-' + String(conv.titulo || 'voluntarios').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '.png';

// Diálogo de pré-visualização com Baixar / Compartilhar.
export async function mostrarImagemEscala(conv, toast) {
  const { blob } = await gerarImagemEscala(conv);
  if (!blob) { toast && toast('Não foi possível gerar a imagem neste aparelho', 'erro'); return; }
  const url = URL.createObjectURL(blob);
  const arquivo = new File([blob], nomeArquivo(conv), { type: 'image/png' });
  const podeCompartilhar = !!(navigator.canShare && navigator.canShare({ files: [arquivo] }));
  const baixar = () => {
    const a = document.createElement('a');
    a.href = url; a.download = arquivo.name; document.body.appendChild(a); a.click(); a.remove();
  };
  abrirDialogo({
    titulo: 'Imagem para o WhatsApp',
    subtitulo: 'Confira e envie para o grupo da igreja.',
    abas: [{ id: 'img', rotulo: '', render: (el) => {
      el.innerHTML = '<img alt="Prévia da escala de voluntários" style="width:100%;max-width:420px;display:block;margin:0 auto;border-radius:12px;border:1px solid var(--borda)">';
      el.querySelector('img').src = url;
    } }],
    acoes: [
      { rotulo: 'Fechar' },
      { rotulo: 'Baixar PNG', ao: () => { baixar(); return false; } },
      ...(podeCompartilhar ? [{ rotulo: 'Compartilhar', estilo: 'ok', ao: async () => {
        try { await navigator.share({ files: [arquivo], title: conv.titulo }); } catch (e) { if (e && e.name !== 'AbortError') baixar(); }
        return false;
      } }] : [])
    ],
    aoFechar: () => setTimeout(() => URL.revokeObjectURL(url), 1000)
  });
}
