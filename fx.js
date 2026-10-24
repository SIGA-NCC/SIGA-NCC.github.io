// fx.js — movimento e feedback do painel. Tudo aqui respeita "reduzir movimento":
// com a preferência ligada, o estado final aparece direto, sem animar.

import { esc } from './ui.js';
import { versiculoDoDia, versiculoDoTema, proximoVersiculo } from './versiculos.js';

const reduz = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = (t) => 1 - Math.pow(1 - t, 4);

// Conta de zero (ou do valor anterior) até `para`. `sufixo` entra depois do número.
export function contar(el, para, sufixo = '') {
  const alvo = Number(para);
  if (!isFinite(alvo) || reduz()) { el.textContent = para + sufixo; el.dataset.v = alvo; return; }
  const de = Number(el.dataset.v) || 0;
  el.dataset.v = alvo;
  if (de === alvo) { el.textContent = alvo + sufixo; return; }
  const dur = 650;
  const ini = performance.now();
  const passo = (agora) => {
    const t = Math.min(1, (agora - ini) / dur);
    el.textContent = Math.round(de + (alvo - de) * easeOut(t)) + sufixo;
    if (t < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

// Itens da lista entram em cascata curta (máx. 10 escalonados).
export function cascata(container) {
  if (!container || reduz()) return;
  [...container.children].forEach((el, i) => el.style.setProperty('--i', Math.min(i, 10)));
  container.classList.remove('entra');
  void container.offsetWidth; // reinicia a animação
  container.classList.add('entra');
}

// Esqueleto de carregamento. Com `verso`, mostra um versículo de provisão enquanto espera
// (o Apps Script demora na primeira chamada do dia).
export function esqueleto(ul, linhas = 3, verso = false) {
  let html = '';
  for (let i = 0; i < linhas; i++) {
    html += '<li class="sk" aria-hidden="true"><span class="sk-barra"></span><span class="sk-pilula"></span></li>';
  }
  if (verso) {
    const v = versiculoDoTema('provisao');
    html += `<li class="sk-verso">“${esc(v.texto)}”<span>${esc(v.ref)}</span></li>`;
  }
  ul.innerHTML = html;
  ul.setAttribute('aria-busy', 'true');
}

// Estado vazio com um versículo ao lado da mensagem.
export function vazioComVerso(msg, tema = 'gratidao') {
  const v = versiculoDoTema(tema);
  return `<li class="vazio-verso"><strong>${esc(msg)}</strong>
    <q>${esc(v.texto)}</q><span>${esc(v.ref)}</span></li>`;
}

// Versículo que alterna sozinho. Toque/Enter passa para o próximo; pausa com o dedo/mouse
// em cima e com a aba escondida. Devolve função que para o rodízio.
export function girarVersiculo(el, { intervalo = 14000, tema } = {}) {
  el.innerHTML = '<q class="v-texto"></q><span class="v-ref"></span>';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', 'Versículo. Toque para ver outro');
  const q = el.querySelector('.v-texto');
  const ref = el.querySelector('.v-ref');
  let atual = versiculoDoDia();
  let timer = null;
  let pausado = false;
  let trocando = false;

  const pintar = (v) => { q.textContent = '“' + v.texto + '”'; ref.textContent = v.ref; };
  pintar(atual);

  const trocar = (v) => {
    if (trocando) return;
    atual = v;
    if (reduz()) { pintar(v); return; }
    trocando = true;
    el.classList.add('trocando');
    setTimeout(() => {
      pintar(v);
      el.classList.remove('trocando');
      trocando = false;
    }, 420);
  };
  const proximo = () => trocar(tema ? versiculoDoTema(tema, atual) : proximoVersiculo(atual));

  const agendar = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!pausado && !document.hidden) proximo(); agendar(); }, intervalo);
  };

  el.addEventListener('click', () => { proximo(); agendar(); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); proximo(); agendar(); }
  });
  el.addEventListener('pointerenter', () => { pausado = true; });
  el.addEventListener('pointerleave', () => { pausado = false; });
  el.addEventListener('focus', () => { pausado = true; });
  el.addEventListener('blur', () => { pausado = false; });
  agendar();
  return () => clearTimeout(timer);
}

// Momento de celebração (único do app): concluir uma doação ou uma cesta.
// Cartão central com check desenhado, grãos que se espalham e um versículo do tema.
const CORES = ['#E8A33D', '#C45D3C', '#2E6B52', '#D9CDB0'];
let fecharAtual = null;

export function celebrar({ titulo, detalhe = '', tema = 'dar' }) {
  if (fecharAtual) fecharAtual();
  const v = versiculoDoTema(tema);
  const raiz = document.createElement('div');
  raiz.className = 'celebra';
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-label', titulo);
  raiz.innerHTML = `
    <div class="celebra-cartao">
      <div class="celebra-selo">
        <div class="celebra-graos" aria-hidden="true"></div>
        <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
          <circle class="c-anel" cx="32" cy="32" r="28" fill="none" stroke="currentColor" stroke-width="3.5"/>
          <path class="c-check" d="M19 33.5 L28 42 L45 23" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h2>${esc(titulo)}</h2>
      ${detalhe ? `<p class="celebra-detalhe">${esc(detalhe)}</p>` : ''}
      <blockquote>“${esc(v.texto)}”<span>${esc(v.ref)}</span></blockquote>
      <button class="btn" type="button">Continuar</button>
    </div>`;
  document.body.appendChild(raiz);
  const btn = raiz.querySelector('button');
  const foco = document.activeElement;
  btn.focus({ preventScroll: true });

  if (!reduz()) espalhar(raiz.querySelector('.celebra-graos'));

  let fechado = false;
  const fechar = () => {
    if (fechado) return;
    fechado = true;
    fecharAtual = null;
    clearTimeout(auto);
    document.removeEventListener('keydown', aoTeclar);
    if (reduz()) raiz.remove();
    else { raiz.classList.add('saindo'); setTimeout(() => raiz.remove(), 260); }
    if (foco && foco.focus) foco.focus({ preventScroll: true });
  };
  const aoTeclar = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', aoTeclar);
  raiz.addEventListener('click', (e) => { if (e.target === raiz || e.target === btn) fechar(); });
  const auto = setTimeout(fechar, 7000);
  fecharAtual = fechar;
}

function espalhar(box) {
  const n = 16;
  for (let i = 0; i < n; i++) {
    const g = document.createElement('i');
    g.style.background = CORES[i % CORES.length];
    box.appendChild(g);
    const ang = (Math.PI * 2 * i) / n + (Math.random() - 0.5) * 0.4;
    const raio = 62 + Math.random() * 44;
    const dx = Math.cos(ang) * raio;
    const dy = Math.sin(ang) * raio + 14;
    const giro = (Math.random() - 0.5) * 220;
    g.animate([
      { transform: 'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${giro}deg)`, opacity: 0 }
    ], { duration: 900 + Math.random() * 300, delay: 280, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
  }
}
