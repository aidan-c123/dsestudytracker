import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual as nodeEqual } from 'node:crypto';

/* ---------------------------------- crypto -------------------------------- */

export const randomId = () => randomUUID();

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function randomRecoveryCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[buf[i] % alphabet.length];
    if (i === 3 || i === 7) out += '-';
  }
  return out;
}

function pbkdf2(password, salt, iterations = 210000) {
  return pbkdf2Sync(password, salt, iterations, 32, 'sha256');
}

export function hashPassword(password) {
  const salt = randomBytes(16);
  return {
    hash: pbkdf2(password, salt).toString('hex'),
    salt: salt.toString('hex'),
    iterations: 210000
  };
}

export function verifyPassword(password, record) {
  if (!record?.hash || !record?.salt) return false;
  const salt = Buffer.from(record.salt, 'hex');
  const candidate = pbkdf2(password, salt, record.iterations || 210000);
  const expected = Buffer.from(record.hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return nodeEqual(candidate, expected);
}

/* --------------------------------- cookies -------------------------------- */

export const SESSION_COOKIE = 'dse_session';
export const SESSION_SECONDS = 30 * 86400;

export function readCookie(headers, name) {
  // Accepts a Headers instance (Web Request) or a plain Node header object.
  const raw =
    typeof headers?.get === 'function' ? headers.get('cookie') || '' : headers?.cookie || headers?.Cookie || '';
  for (const part of String(raw).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export function sessionCookie(token, secure, maxAge = SESSION_SECONDS) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${
    secure ? '; Secure' : ''
  }`;
}

export function clearCookie(secure) {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

/* -------------------------------- validation ------------------------------- */

export const LIMITS = { text: 2000, short: 160, email: 254 };

export function text(value, max = LIMITS.short) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function validEmail(value) {
  const email = text(value, LIMITS.email).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 200;
}

export function level(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1 || n > 7) return null;
  return n;
}

export function numOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function dateOrNull(value) {
  const t = text(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export function percentageOf(score, maxScore, fallback) {
  let pct = numOrNull(fallback);
  if (score !== null && maxScore && maxScore > 0) pct = (score / maxScore) * 100;
  if (pct === null) return null;
  return Math.min(100, Math.max(0, Math.round(pct * 10) / 10));
}

/* --------------------------------- catalog -------------------------------- */

export const CORE_CODES = ['CHIN', 'ENG', 'MATH', 'CSD'];

/**
 * CSD (Citizenship and Social Development) replaced Liberal Studies in 2024.
 * HKEAA reports it only as "Attained" or "Unattained" — there are no 1–5**
 * levels, it has a single Paper 1 (2 hours, 100%), and it has no SBA.
 */
export const CSD_CODE = 'CSD';
export const CSD_FIRST_YEAR = 2024;
export const ATTAINMENT = {
  attained: 'Attained',
  unattained: 'Not attained'
};

/** True when a subject is graded attained/unattained rather than on levels. */
export const usesAttainment = (subject) => String(subject?.code || '').toUpperCase() === CSD_CODE;

export function attainment(value) {
  const key = text(value, 20).toLowerCase();
  if (key === 'attained' || key === 'attain' || key === 'pass') return 'attained';
  if (key === 'unattained' || key === 'not-attained' || key === 'not attained' || key === 'fail') {
    return 'unattained';
  }
  return null;
}

export const SUBJECT_CATALOG = {
  CHIN: { name: '中國語文', category: 'core' },
  ENG: { name: 'English Language', category: 'core' },
  MATH: { name: 'Mathematics', category: 'core' },
  CSD: { name: '公民與社會發展', category: 'core' },
  M1: { name: 'M1 — Calculus & Statistics', category: 'extended' },
  M2: { name: 'M2 — Algebra & Calculus', category: 'extended' },
  BIOL: { name: 'Biology', category: 'elective' },
  CHEM: { name: 'Chemistry', category: 'elective' },
  PHYS: { name: 'Physics', category: 'elective' },
  ECON: { name: 'Economics', category: 'elective' },
  GEOG: { name: 'Geography', category: 'elective' },
  HIST: { name: 'History', category: 'elective' },
  CHIST: { name: '中國歷史', category: 'elective' },
  BAFS: { name: 'BAFS', category: 'elective' },
  ICT: { name: 'ICT', category: 'elective' },
  CLIT: { name: '中國文學', category: 'elective' },
  LIT: { name: 'Literature in English', category: 'elective' },
  THS: { name: '旅遊與款待', category: 'elective' },
  HMSC: { name: '健康與社會關懷', category: 'elective' },
  DAT: { name: '設計與應用科技', category: 'elective' },
  VA: { name: 'Visual Arts', category: 'elective' },
  MUS: { name: 'Music', category: 'elective' },
  PE: { name: 'Physical Education', category: 'elective' },
  ERS: { name: '倫理與宗教', category: 'elective' }
};

export const catalogEntry = (code) => SUBJECT_CATALOG[String(code || '').toUpperCase()] || null;
