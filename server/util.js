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

export function hashPassword(password, iterations = 210000) {
  const salt = randomBytes(16);
  return {
    hash: pbkdf2(password, salt, iterations).toString('hex'),
    salt: salt.toString('hex'),
    iterations
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

/** Grade bands: percentages at which Level 2…5** start. */
export function gradeBands(input) {
  const LEVELS = [2, 3, 4, 5, 6, 7];
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  for (const lvl of LEVELS) {
    const raw = input[lvl];
    if (raw === undefined || raw === null || raw === '') continue;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1 || n > 99) return null;
    out[lvl] = n;
  }
  if (!Object.keys(out).length) return null;
  // Bands must climb, or every prediction above the inversion is nonsense.
  let previous = 0;
  for (const lvl of LEVELS) {
    if (out[lvl] === undefined) continue;
    if (out[lvl] <= previous) return null;
    previous = out[lvl];
  }
  return out;
}

/**
 * Papers that a subject actually had in a given year. Chinese dropped Paper 3
 * (Listening & Integrated Skills) and Paper 4 (Speaking) from 2024, so old
 * sittings remain loggable while new ones cannot claim a Paper 3.
 */
export const CHINESE_REFORM_YEAR = 2024;

export function papersForYear(code, year) {
  const subject = String(code || '').toUpperCase();
  const y = Number(year);
  if (subject === CSD_CODE) return ['P1'];
  if (subject === 'CHIN') return y < CHINESE_REFORM_YEAR ? ['P1', 'P2', 'P3', 'P4'] : ['P1', 'P2'];
  return null; // no year-dependent rules for other subjects
}

/** True when a paper is not offered for that subject in that year. */
export function paperRetired(code, year, paper) {
  const allowed = papersForYear(code, year);
  if (!allowed) return false;
  return !allowed.includes(String(paper || '').toUpperCase());
}

/**
 * Papers that are not DSE past papers. The matrix stays DSE-only, so these are
 * logged separately: your own school's mock, another school's, a tutorial
 * centre or publisher mock, textbooks, practice papers and other exam boards.
 *
 * The keys are stored in the database and are therefore permanent; only the
 * labels are wording, and changing one never rewrites a saved record.
 */
export const OTHER_SOURCES = {
  school: "My school's mock",
  'other-school': "Other schools' mock",
  tutorial: 'Tutorial centre / publisher mock',
  textbook: 'Textbook or exercise',
  practice: 'HKEAA practice paper',
  'other-board': 'Other exam board',
  other: 'Other'
};

export const otherSource = (value) => {
  const key = text(value, 30).toLowerCase();
  return Object.prototype.hasOwnProperty.call(OTHER_SOURCES, key) ? key : 'school';
};

export function attainment(value) {
  const key = text(value, 20).toLowerCase();
  if (key === 'attained' || key === 'attain' || key === 'pass') return 'attained';
  if (key === 'unattained' || key === 'not-attained' || key === 'not attained' || key === 'fail') {
    return 'unattained';
  }
  return null;
}

export const SUBJECT_CATALOG = {
  CHIN: { name: 'Chinese Language', category: 'core' },
  ENG: { name: 'English Language', category: 'core' },
  MATH: { name: 'Mathematics', category: 'core' },
  CSD: { name: 'Citizenship & Social Development', category: 'core' },
  M1: { name: 'M1 — Calculus & Statistics', category: 'extended' },
  M2: { name: 'M2 — Algebra & Calculus', category: 'extended' },
  BIOL: { name: 'Biology', category: 'elective' },
  CHEM: { name: 'Chemistry', category: 'elective' },
  PHYS: { name: 'Physics', category: 'elective' },
  ECON: { name: 'Economics', category: 'elective' },
  GEOG: { name: 'Geography', category: 'elective' },
  HIST: { name: 'History', category: 'elective' },
  CHIST: { name: 'Chinese History', category: 'elective' },
  BAFS: { name: 'Business, Accounting & Financial Studies', category: 'elective' },
  ICT: { name: 'Information & Communication Technology', category: 'elective' },
  CLIT: { name: 'Chinese Literature', category: 'elective' },
  LIT: { name: 'Literature in English', category: 'elective' },
  THS: { name: 'Tourism & Hospitality Studies', category: 'elective' },
  HMSC: { name: 'Health Management & Social Care', category: 'elective' },
  DAT: { name: 'Design & Applied Technology', category: 'elective' },
  VA: { name: 'Visual Arts', category: 'elective' },
  MUS: { name: 'Music', category: 'elective' },
  PE: { name: 'Physical Education', category: 'elective' },
  ERS: { name: 'Ethics & Religious Studies', category: 'elective' }
};

export const catalogEntry = (code) => SUBJECT_CATALOG[String(code || '').toUpperCase()] || null;

/**
 * Catalog names changed from Chinese to English. Accounts created earlier still
 * carry the old string, so correct it when the account loads rather than
 * leaving one student with a half-translated subject list.
 */
export const LEGACY_SUBJECT_NAMES = {
  '中國語文': 'Chinese Language',
  '公民與社會發展': 'Citizenship & Social Development',
  '中國歷史': 'Chinese History',
  '中國文學': 'Chinese Literature',
  '旅遊與款待': 'Tourism & Hospitality Studies',
  '健康管理與社會關懷': 'Health Management & Social Care',
  '健康與社會關懷': 'Health Management & Social Care',
  '設計與應用科技': 'Design & Applied Technology',
  '倫理與宗教': 'Ethics & Religious Studies',
  'BAFS': 'Business, Accounting & Financial Studies',
  'ICT': 'Information & Communication Technology'
};

/** English name for a code, falling back to the stored name. */
export function englishName(code, fallback = '') {
  const entry = catalogEntry(code);
  if (entry) return entry.name;
  return LEGACY_SUBJECT_NAMES[fallback] || fallback;
}
