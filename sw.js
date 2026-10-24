// sw.js — PWA do SIGA-NCC. Telas e scripts: rede primeiro (sempre a versão nova), cache só sem sinal.
// O vídeo fica fora (sem sinal, a abertura cai direto no login). Chamadas ao Apps Script nunca passam por aqui.
const VERSAO = 'siga-ncc-v7';
const BASE = [
  './', './index.html', './login.html', './manifest.json',
  './auth.js', './acesso.js', './config.js', './demo.js', './ui.js', './fx.js', './versiculos.js',
  './cestas.js', './recebedores.js', './escala.js', './imagem-escala.js', './notificacoes.js', './levantamento.js', './alertas-adm.js', './movimentos.js', './admin.js', './estoque-mapa.js', './estoque-mapa.css',
  './painel-motor.js', './painel-dados.js', './painel-ncc.css', './impacto.js', './grafico-mini.js', './sigma-dialogo.js',
  './icones/icone-192.png', './icones/icone-512.png', './midia/welcome-poster.jpg', './midia/boas-vindas.webp', './midia/boas-vindas.jpg'
];

self.addEventListener('install', (e) => {
  // falha de um arquivo não pode impedir a instalação: cada um entra se der
  e.waitUntil(caches.open(VERSAO).then(c => Promise.all(BASE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // GAS e fontes: direto na rede
  // vídeo: o navegador pede por partes (Range); interceptar quebra o vídeo no iPhone → direto na rede
  if (url.pathname.endsWith('.mp4')) return;
  e.respondWith(fetch(req).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(req, copia)); }
    return r;
  }).catch(() => caches.match(req).then(c => c || caches.match('./index.html'))));
});

// Toque no aviso do aparelho: foca o app (ou abre) e pede para mostrar o alerta.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const id = (e.notification.data && e.notification.data.id) || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const aberto = cs.find(c => c.url.includes('index.html') || c.url.endsWith('/'));
    if (aberto) { aberto.postMessage({ tipo: 'abrir-alerta', id }); return aberto.focus(); }
    return self.clients.openWindow('./index.html' + (id ? '?alerta=' + encodeURIComponent(id) : ''));
  }));
});
