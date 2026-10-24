// Autenticação do SIGA-NCC — cópia adaptada do auth.js do SIGMA-MRO (D2).
// O backend devolve token ASSINADO (HMAC, 12h deslizantes, preso ao aparelho
// via vid). O front não decide quem está logado: só carrega o token e o
// servidor confere.

import { GAS_URL } from './config.js';

const endpoint = () => (typeof window !== 'undefined' && window.SIGA_GAS_URL) || GAS_URL;

// Sem a URL /exec configurada, o front roda contra um backend de mentira (demo.js).
export const modoDemo = () => /^COLE_AQUI/.test(String(endpoint()));

const CHAVE_SESSAO = 'siga:sessao';
const CHAVE_VID = 'siga:vid';

// Identidade do aparelho: 1 por navegador, criada uma vez. O token só vale
// no aparelho que o pediu — token copiado para outro device não passa.
export function vid() {
  try {
    let v = localStorage.getItem(CHAVE_VID);
    if (!v) {
      v = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(16).slice(2);
      localStorage.setItem(CHAVE_VID, v);
    }
    return v;
  } catch (e) {
    return 'sem-armazenamento';
  }
}

export function sessaoLocal() {
  try {
    const bruto = localStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;
    const s = JSON.parse(bruto);
    if (!s || !s.token) return null;
    if (s.expira_em && new Date(s.expira_em).getTime() < Date.now()) { esquecerSessao(); return null; }
    return s;
  } catch (e) {
    return null;
  }
}

export function esquecerSessao() {
  try { localStorage.removeItem(CHAVE_SESSAO); } catch (e) {}
}

function guardarSessao(s) {
  try { localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s)); } catch (e) {}
}

// Timeout: sem ele um fetch travado (rede instável) deixa o botão preso em
// "Entrando…" para sempre (achado do SIGMA 2026-09-10).
async function chamar(body, timeoutMs = 15000) {
  if (modoDemo()) return (await import('./demo.js')).demoChamar(body);
  const ctrl = new AbortController();
  const relogio = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Sem resposta do servidor. Verifique a conexão e tente de novo.');
    throw new Error('Falha de rede ao falar com o servidor. Tente de novo.');
  } finally {
    clearTimeout(relogio);
  }
  try {
    return await res.json();
  } catch (e) {
    throw new Error('Resposta inesperada do servidor. Tente de novo.');
  }
}

export async function entrar(login, senha) {
  const r = await chamar({ action: 'login', login, senha, vid: vid() });
  if (!r.ok) throw new Error(r.error || 'Falha no login');
  const usuario = Object.assign({}, r.usuario, {
    admin: !!(r.usuario && (r.usuario.admin === true || String(r.usuario.papel).toUpperCase() === 'ADMIN')),
    deve_trocar_senha: r.deve_trocar_senha === true,
    expira_em: r.expira_em || ''
  });
  guardarSessao({ token: r.token, expira_em: r.expira_em, usuario: usuario, conferida_em: Date.now() });
  return usuario;
}

export async function sair() {
  const s = sessaoLocal();
  esquecerSessao();
  if (s) { try { await chamar({ action: 'logout', token: s.token, vid: vid() }); } catch (e) {} }
}

// Confere a sessão NO SERVIDOR (único lugar que vale). Use no boot de cada página.
export async function verificarSessao() {
  const s = sessaoLocal();
  if (!s) return null;
  const r = await chamar({ action: 'sessao', token: s.token, vid: vid() });
  if (!r.ok) { esquecerSessao(); return null; }
  // Renovo deslizante: o servidor troca o token quando passa de 30 min.
  const usuario = Object.assign({}, s.usuario, r.usuario);
  usuario.admin = usuario.admin === true || String(usuario.papel).toUpperCase() === 'ADMIN';
  guardarSessao(Object.assign({}, s, {
    usuario: usuario,
    token: r.token || s.token,
    expira_em: r.expira_em || s.expira_em,
    sessao_horas: r.sessao_horas || s.sessao_horas,
    conferida_em: Date.now()
  }));
  return sessaoLocal().usuario;
}

const RENOVAR_MS = 30 * 60 * 1000;
export async function renovarSeVelha() {
  const s = sessaoLocal();
  if (!s || (s.conferida_em && Date.now() - s.conferida_em < RENOVAR_MS)) return;
  let u;
  try { u = await verificarSessao(); } catch (e) { return; }
  if (!u && typeof location !== 'undefined' && !/\/login\.html$/i.test(location.pathname)) location.replace('./login.html');
}

export function infoSessao() {
  const s = sessaoLocal();
  return s ? { expira_em: s.expira_em || '', sessao_horas: s.sessao_horas || 12 } : null;
}

export async function trocarSenha(senhaAtual, senhaNova) {
  const s = sessaoLocal();
  if (!s) throw new Error('sem sessão');
  const r = await chamar({ action: 'trocar_senha', token: s.token, vid: vid(), senha_atual: senhaAtual, senha_nova: senhaNova });
  if (!r.ok) throw new Error(r.error || 'Falha ao trocar a senha');
  // Senha nova assumida: sai a marca de troca obrigatória.
  const novo = Object.assign({}, s, {
    usuario: Object.assign({}, s.usuario, { deve_trocar_senha: false })
  });
  guardarSessao(novo);
  return true;
}

// Anexa token+vid em qualquer chamada ao backend.
export function comSessao(body) {
  const s = sessaoLocal();
  return s ? Object.assign({}, body, { token: s.token, vid: vid() }) : Object.assign({}, body, { vid: vid() });
}

export async function chamarAutenticado(body, timeoutMs) {
  const r = await chamar(comSessao(body), timeoutMs);
  if (!r.ok && /sessao invalida|expirada/i.test(String(r.error || ''))) {
    esquecerSessao();
    throw new Error('Sessão expirada — entre de novo');
  }
  return r;
}

// Guarda de página: manda pro login se não houver sessão válida no servidor.
export async function exigirLogin(paginaLogin = './login.html') {
  const u = await verificarSessao();
  if (!u) { location.href = paginaLogin; return null; }
  return u;
}

// Computador compartilhado: voltar do navegador / troca de conta em outra aba
// não pode mostrar a página desenhada da conta anterior (E0.2 do SIGMA).
function loginDaSessao() {
  const s = sessaoLocal();
  return (s && s.usuario && String(s.usuario.login || '').toLowerCase()) || '';
}

export function sentinelaDeConta() {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof location === 'undefined') return;
  if (window.__sigaSentinela) return;
  window.__sigaSentinela = true;
  if (/\/login\.html$/i.test(location.pathname)) return;
  const dono = loginDaSessao();
  const conferir = () => {
    if (loginDaSessao() === dono) return;
    try { document.documentElement.style.visibility = 'hidden'; } catch (e) {}
    location.replace(dono && !loginDaSessao() ? './login.html' : location.href);
  };
  window.addEventListener('pageshow', (e) => { if (e.persisted) conferir(); });
  window.addEventListener('storage', (e) => { if (e.key === CHAVE_SESSAO || e.key === null) conferir(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { conferir(); renovarSeVelha(); } });
  setInterval(() => { if (!document.hidden) renovarSeVelha(); }, 15 * 60 * 1000);
}
sentinelaDeConta();
