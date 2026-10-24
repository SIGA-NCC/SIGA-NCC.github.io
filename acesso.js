// Pedidos de acesso — o lado do usuário. Nada aqui cria conta: tudo vira
// PENDENTE para o ADMIN aprovar (D3).

import { GAS_URL } from './config.js';
import { vid, modoDemo } from './auth.js';

const endpoint = () => (typeof window !== 'undefined' && window.SIGA_GAS_URL) || GAS_URL;

// Também usada pela tela pública de impacto (sem login).
export async function chamar(body) {
  if (modoDemo()) return (await import('./demo.js')).demoChamar(body);
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ vid: vid(), user_agent: navigator.userAgent }, body)),
  });
  return res.json();
}

export async function pedirAcesso(dados) {
  const r = await chamar(Object.assign({ action: 'solicitar_acesso' }, dados));
  if (!r.ok) { const e = new Error(r.error || 'Falha ao enviar'); e.campos = r.campos || []; throw e; }
  return r;
}

// "Esqueci minha senha" (D24): a pessoa escolhe a senha nova; ela só passa a valer quando o ADM aprovar.
export async function pedirNovaSenha(dados) {
  const r = await chamar(Object.assign({ action: 'pedir_nova_senha' }, dados));
  if (!r.ok) { const e = new Error(r.error || 'Falha ao enviar'); e.campos = r.campos || []; throw e; }
  return r;
}

// ---------- máscaras e validação (mesmas regras do backend) ----------

export function mascaraTelefone(v) {
  const d = String(v || '').replace(/\D+/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const soDigitos = (v) => String(v || '').replace(/\D+/g, '');

export function validarPedidoAcesso(d) {
  const erros = {};
  if (String(d.nome_completo || '').trim().split(/\s+/).length < 2) {
    erros.nome_completo = 'Escreva nome e sobrenome';
  }
  if (soDigitos(d.telefone).length < 10) erros.telefone = 'Telefone com DDD (ex.: (21) 98888-7777)';
  if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) erros.email = 'E-mail inválido';
  return erros;
}

// Força da senha — usada na troca obrigatória do primeiro acesso.
export function forcaSenha(senha) {
  const s = String(senha || '');
  let pontos = 0;
  if (s.length >= 8) pontos++;
  if (s.length >= 12) pontos++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) pontos++;
  if (/\d/.test(s)) pontos++;
  if (/[^A-Za-z0-9]/.test(s)) pontos++;
  const rotulo = ['muito fraca', 'fraca', 'razoável', 'boa', 'forte', 'forte'][pontos];
  return { pontos, rotulo, aceitavel: s.length >= 8 };
}
