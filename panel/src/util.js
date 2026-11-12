// Utilidades comunes del servidor del panel.

export const now = () => Date.now();

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });
}

export class HttpError extends Error {
  constructor(status, code, message) { super(message || code); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new HttpError(status, code, message); };

const B32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para que no se confundan
export function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const s = [...bytes].map(b => B32[b % B32.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
export function randomToken(n = 32) {
  return [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function sha1Bytes(bytes) {
  const buf = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export const CODE_RE = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
export function normalizeCode(c) {
  const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 12) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
export const NAME_RE = /^[A-Za-z0-9_]{2,16}$/;
export const playerKey = (name) => String(name || '').trim().toLowerCase();

export function slugify(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'instancia';
}

export async function readJson(req, max = 512 * 1024) {
  const text = await req.text();
  if (text.length > max) fail(413, 'too_large', 'Demasiados datos');
  if (!text) return {};
  try { return JSON.parse(text); } catch { fail(400, 'bad_json', 'JSON no válido'); }
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function cookie(name, value, { maxAge, path = '/', httpOnly = true } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=Lax; Secure`;
  if (httpOnly) c += '; HttpOnly';
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  return c;
}

export const clientIp = (req) => req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || '';

// ---------- texto / colores / urls ----------
export const str = (v, max = 200) => (v == null ? '' : String(v).slice(0, max));
export const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';
export const color = (v, def) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : def);
export function url(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  if (/^\/m\/[A-Za-z0-9_-]+(\/[^\s]*)?$/.test(s)) return s;
  if (/^https:\/\/[^\s]+$/i.test(s) && s.length <= 600) return s;
  return null;
}
export function int(v, min, max, def = null) {
  if (v === '' || v === null || v === undefined) return def;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
