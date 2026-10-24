// instalar.js — convite para instalar o app (PWA) no celular e no computador.
// Android/PC (Chrome, Edge): usa o pedido nativo do navegador (beforeinstallprompt) → 1 toque.
// iPhone/iPad: o Safari não tem pedido nativo → mostra o caminho (Compartilhar → Adicionar à Tela de Início).
// Já instalado (abrindo pelo ícone) → não aparece. "Agora não" → volta em 7 dias.

const CHAVE = 'siga:instalar-adiado';
const instalado = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const celular = ios || /android|mobile/i.test(navigator.userAgent);
const adiado = () => { try { return Date.now() < Number(localStorage.getItem(CHAVE) || 0); } catch (e) { return false; } };
const adiar = () => { try { localStorage.setItem(CHAVE, String(Date.now() + 7 * 864e5)); } catch (e) {} };

let pedido = null;   // evento guardado do navegador
let caixa = null;

const CSS = `
#inst { position: fixed; left: 12px; right: 12px; bottom: calc(14px + env(safe-area-inset-bottom)); z-index: 90;
  max-width: 460px; margin: 0 auto; display: flex; gap: 14px; align-items: center; padding: 14px 14px 14px 16px;
  background: #1F4739; color: #F7F1E3; border-radius: 18px; box-shadow: 0 14px 40px rgba(18,40,31,.35);
  font: 500 .95rem/1.35 'Public Sans', system-ui, sans-serif; transform: translateY(140%); transition: transform .5s cubic-bezier(.2,.9,.3,1.1); }
#inst.ver { transform: none; }
#inst img { width: 48px; height: 48px; border-radius: 12px; flex: none; }
#inst .tx { flex: 1; min-width: 0; }
#inst b { display: block; font-size: 1.02rem; margin-bottom: 2px; }
#inst .bt { display: flex; flex-direction: column; gap: 6px; flex: none; }
#inst button { font: 700 .92rem 'Public Sans', system-ui, sans-serif; border: 0; border-radius: 11px; padding: 11px 16px; cursor: pointer; min-height: 44px; }
#inst .sim { background: #E8A33D; color: #12281F; }
#inst .nao { background: transparent; color: rgba(247,241,227,.75); padding: 6px 10px; min-height: 0; font-weight: 600; }
#inst .ios-seta { display: inline-block; padding: 0 4px; font-weight: 800; color: #E8A33D; }
@media (prefers-reduced-motion: reduce) { #inst { transition: none; } }
`;

function mostrar() {
  if (caixa || instalado() || adiado()) return;
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  caixa = document.createElement('div');
  caixa.id = 'inst';
  caixa.setAttribute('role', 'dialog');
  caixa.setAttribute('aria-label', 'Instalar o aplicativo');
  const onde = celular ? 'no seu celular' : 'no seu computador';
  const texto = ios && !pedido
    ? `Toque em <span class="ios-seta">Compartilhar ⬆</span> e depois em <b style="display:inline">Adicionar à Tela de Início</b>.`
    : 'Abre mais rápido, com o ícone da cesta, como um aplicativo.';
  caixa.innerHTML = `<img src="icones/icone-192.png" alt="">
    <div class="tx"><b>Instale o SIGA ${onde}</b>${texto}</div>
    <div class="bt">${pedido ? '<button type="button" class="sim">Instalar</button>' : ''}<button type="button" class="nao">${pedido ? 'Agora não' : 'Entendi'}</button></div>`;
  document.body.appendChild(caixa);
  requestAnimationFrame(() => requestAnimationFrame(() => caixa.classList.add('ver')));
  caixa.querySelector('.nao').addEventListener('click', () => { adiar(); fechar(); });
  const sim = caixa.querySelector('.sim');
  if (sim) sim.addEventListener('click', async () => {
    pedido.prompt();
    const r = await pedido.userChoice.catch(() => ({}));
    pedido = null;
    if (r.outcome !== 'accepted') adiar();
    fechar();
  });
}

function fechar() {
  if (!caixa) return;
  caixa.classList.remove('ver');
  const c = caixa; setTimeout(() => c.remove(), 500);
}

// Na tela de entrada, espera o vídeo de abertura sair para não cobrir nada.
function quandoLivre(fn) {
  let n = 0;
  const t = setInterval(() => {
    const v = document.getElementById('tela-video');
    if (!v || v.hidden || ++n > 40) { clearInterval(t); setTimeout(fn, 1500); }
  }, 500);
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pedido = e;
  if (caixa) { caixa.remove(); caixa = null; }
  quandoLivre(mostrar);
});
window.addEventListener('appinstalled', () => { pedido = null; fechar(); });

// iPhone/iPad não dispara o pedido: mostra o caminho manual.
if (ios && !instalado()) quandoLivre(mostrar);
