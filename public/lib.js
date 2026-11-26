/* ============================================================
   Shared: icons, formatting, data selectors, API, theme, modal
   ============================================================ */

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONS = {
  desk: '<path d="M3 10.6 12 3.4l9 7.2"/><path d="M5.3 9.4V20.6h13.4V9.4"/><path d="M9.6 20.6v-5.4h4.8v5.4"/>',
  papers: '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2.4"/><path d="M3.4 9.2h17.2M9.2 9.2v11.4"/>',
  focus: '<circle cx="12" cy="13" r="8"/><path d="M12 9.4V13l2.6 1.7M9.4 2.6h5.2"/>',
  tasks: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3"/><path d="M8 12.2l2.6 2.6L16.4 8.8"/>',
  settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M4.5 12.5l5 5L19.5 7"/>',
  trash: '<path d="M4 7h16M9.5 7V4.6h5V7M6.4 7l1 13.4h9.2l1-13.4"/>',
  logout: '<path d="M15 8V5.6a1.6 1.6 0 0 0-1.6-1.6H5.6A1.6 1.6 0 0 0 4 5.6v12.8A1.6 1.6 0 0 0 5.6 20h7.8A1.6 1.6 0 0 0 15 18.4V16"/><path d="M10 12h11M18 8.6 21.4 12 18 15.4"/>',
  play: '<path d="M7 4.8 19 12 7 19.2z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  reset: '<path d="M4 10a8 8 0 1 1 2.4 7.6"/><path d="M4 4.6V10h5.4"/>',
  edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/>',
  arrow: '<path d="M5 12h13M13 6.6 18.4 12 13 17.4"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/>',
  flame: '<path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-2 1-3.4 1-3.4S9 11 10.4 11c1.5 0 1.4-2.2 1.4-2.2S12 6 12 3z"/>',
  moon: '<path d="M20 14.4A8.4 8.4 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4z"/>',
  book: '<path d="M4 5.4A2.4 2.4 0 0 1 6.4 3H20v15.6H6.4A2.4 2.4 0 0 0 4 21z"/><path d="M4 18.6V5.4"/><path d="M8 7.6h8M8 11.2h5"/>'
};

export function icon(name, attrs = '') {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${attrs}>${ICONS[name] || ''}</svg>`;
}

/* ------------------------------- formatting ------------------------------- */

export const LEVEL_LABELS = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '5*', 7: '5**' };
export const lvlLabel = (n) => (n ? LEVEL_LABELS[n] || String(n) : '—');
export const lvlChip = (n) => `<span class="lvl lvl-${n || 0}">${lvlLabel(n)}</span>`;

/* --------------------------------- CSD ----------------------------------- */

/**
 * CSD was first examined in 2024 and HKEAA reports it only as
 * "Attained" / "Unattained". No levels, one paper, and no SBA.
 */
export const CSD_CODE = 'CSD';
export const CSD_FIRST_YEAR = 2024;
export const ATTAINMENT_LABELS = { attained: 'Attained', unattained: 'Not attained' };
export const usesAttainment = (subject) => String(subject?.code || '').toUpperCase() === CSD_CODE;
export const attainmentLabel = (value) => ATTAINMENT_LABELS[value] || '—';
export const attainmentChip = (value) =>
  value
    ? `<span class="attain ${value}">${attainmentLabel(value)}</span>`
    : '<span class="attain">—</span>';

/** Years a subject was actually examined, newest first. */
export const yearsFor = (subject) => {
  const first = usesAttainment(subject) ? CSD_FIRST_YEAR : 2012;
  const out = [];
  for (let y = 2026; y >= first; y--) out.push(y);
  return out;
};

export const SUBJECT_CODES = {
  CHIN: ['P1', 'P2', 'P3'],
  ENG: ['P1', 'P2', 'P3', 'P4'],
  MATH: ['P1', 'P2'],
  M1: ['P1'],
  M2: ['P1'],
  CSD: ['P1']
};
export const papersFor = (subject) => SUBJECT_CODES[subject?.code] || ['P1', 'P2'];

export const YEARS = Array.from({ length: 15 }, (_, i) => 2026 - i);

export const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
export const dayKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const target = startOfDay(new Date(`${dateStr.slice(0, 10)}T00:00:00`));
  return Math.round((target - startOfDay()) / 86400000);
};
export const fmtDate = (dateStr, opts = { day: 'numeric', month: 'short' }) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length <= 10 ? `${dateStr}T00:00:00` : dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', opts);
};
export const fmtDue = (dateStr) => {
  const n = daysUntil(dateStr);
  if (n === null) return { text: 'No date', cls: '' };
  if (n < 0) return { text: `${Math.abs(n)}d overdue`, cls: 'due-soon' };
  if (n === 0) return { text: 'Due today', cls: 'due-soon' };
  if (n === 1) return { text: 'Due tomorrow', cls: 'due-soon' };
  if (n <= 7) return { text: `${n} days left`, cls: 'due-soon' };
  return { text: `${fmtDate(dateStr)} · ${n}d`, cls: '' };
};
export const fmtMinutes = (m) => {
  const mins = Math.round(m || 0);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
};
export const pct = (n) => (Number.isFinite(n) ? `${Math.round(n)}%` : '—');
export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'D';

export const levelFromPercentage = (p) => {
  if (!Number.isFinite(p)) return null;
  if (p >= 88) return 7;
  if (p >= 78) return 6;
  if (p >= 68) return 5;
  if (p >= 58) return 4;
  if (p >= 48) return 3;
  if (p >= 38) return 2;
  return 1;
};

export const toLocalInput = (date = new Date()) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ---------------------------------- state --------------------------------- */

export const state = {
  data: null,
  view: 'desk',
  paperSubjectId: null,
  taskFilter: 'open',
  errorSubject: 'all',
  timerPresetMinutes: 25,
  timerSubject: null
};

/** Overlay containers live in index.html; create them if a page omits them. */
export function host(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
  return el;
}

export const hooks = { renderView() {}, renderApp() {}, syncNav() {}, afterAuth() {} };

/* ----------------------------------- api ---------------------------------- */

export async function api(path, { method = 'GET', body } = {}) {
  // Single endpoint: the route travels in `__p` because plain Vercel `api/`
  // folders don't support bracket catch-all routes.
  const route = String(path || '/').replace(/^\/+/, '') || 'health';
  const res = await fetch(`/api?__p=${encodeURIComponent(route)}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status}).`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function refresh(data) {
  state.data = data?.user ? data : await api('/me');
  if (!state.data.subjects.some((s) => s.id === state.paperSubjectId)) {
    state.paperSubjectId = state.data.subjects[0]?.id || null;
  }
  hooks.renderView();
  hooks.syncNav();
}

/* -------------------------------- selectors ------------------------------- */

export const subjectById = (id) => state.data.subjects.find((s) => s.id === id) || null;
export const papersOf = (subjectId) => state.data.papers.filter((p) => p.subjectId === subjectId);
export const focusLogs = () => state.data.logs.filter((l) => l.mode === 'focus');

export function subjectPrediction(subject) {
  if (subject.predictedLevel) return { level: subject.predictedLevel, source: 'school' };
  const withLevel = papersOf(subject.id).filter((p) => p.estimatedLevel);
  if (withLevel.length) {
    const recent = withLevel.slice(0, 4);
    return { level: Math.round(recent.reduce((a, p) => a + p.estimatedLevel, 0) / recent.length), source: 'papers' };
  }
  const withPct = papersOf(subject.id).filter((p) => Number.isFinite(p.percentage));
  if (!withPct.length) return { level: null, source: 'none' };
  return { level: levelFromPercentage(withPct.reduce((a, p) => a + p.percentage, 0) / withPct.length), source: 'pct' };
}

/**
 * CSD has no levels, so attainment is predicted separately: the most recent
 * logged paper carries the call, falling back to the school's judgement.
 */
export function subjectAttainment(subject) {
  const marked = papersOf(subject.id)
    .filter((p) => p.attainment === 'attained' || p.attainment === 'unattained')
    .sort((a, b) => b.year - a.year);
  if (marked.length) return { value: marked[0].attainment, source: 'papers' };
  if (subject.attainment) return { value: subject.attainment, source: 'school' };
  const avg = subjectPct(subject.id);
  if (avg === null) return { value: null, source: 'none' };
  // Attainment is a pass mark; a bare average is only a hint, not a prediction.
  return { value: avg >= 50 ? 'attained' : 'unattained', source: 'pct' };
}

export function subjectPct(subjectId) {
  const list = papersOf(subjectId).filter((p) => Number.isFinite(p.percentage));
  if (!list.length) return null;
  return Math.round((list.reduce((a, p) => a + p.percentage, 0) / list.length) * 10) / 10;
}

export const minutesOnDay = (key) =>
  focusLogs().filter((l) => dayKey(l.completedAt) === key).reduce((a, l) => a + l.minutes, 0);

export function dailySeries(days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    const key = dayKey(d);
    out.push({
      key,
      label: d.toLocaleDateString('en-GB', { weekday: 'narrow' }),
      full: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      minutes: minutesOnDay(key)
    });
  }
  return out;
}

export function rangeMinutes(days) {
  const cutoff = addDays(new Date(), -(days - 1));
  cutoff.setHours(0, 0, 0, 0);
  return focusLogs().filter((l) => new Date(l.completedAt) >= cutoff).reduce((a, l) => a + l.minutes, 0);
}

export function distribution(days = 7) {
  const cutoff = addDays(new Date(), -(days - 1));
  cutoff.setHours(0, 0, 0, 0);
  const totals = new Map();
  for (const log of focusLogs()) {
    if (new Date(log.completedAt) < cutoff) continue;
    const key = log.subjectId || 'none';
    totals.set(key, (totals.get(key) || 0) + log.minutes);
  }
  const rows = [...totals.entries()]
    .map(([id, minutes]) => ({
      id,
      minutes,
      subject: id === 'none' ? { name: 'Untagged' } : subjectById(id) || { name: 'Removed subject' }
    }))
    .sort((a, b) => b.minutes - a.minutes);
  return { rows, total: rows.reduce((a, r) => a + r.minutes, 0) };
}

export function streak(goal) {
  const perDay = new Map();
  for (const log of focusLogs()) {
    const key = dayKey(log.completedAt);
    perDay.set(key, (perDay.get(key) || 0) + log.minutes);
  }
  let count = 0;
  let cursor = new Date();
  if ((perDay.get(dayKey(cursor)) || 0) < goal) cursor = addDays(cursor, -1);
  while ((perDay.get(dayKey(cursor)) || 0) >= goal) {
    count++;
    cursor = addDays(cursor, -1);
    if (count > 400) break;
  }
  return count;
}

/* -------------------------------- countdown ------------------------------- */

export function examMoment() {
  const date = state.data?.user.examDate || '2027-04-06';
  return new Date(`${date}T08:30:00+08:00`);
}

export function countdownParts() {
  const diff = examMoment() - Date.now();
  const c = Math.max(0, diff);
  return {
    past: diff <= 0,
    days: Math.floor(c / 86400000),
    hours: Math.floor((c % 86400000) / 3600000),
    minutes: Math.floor((c % 3600000) / 60000),
    seconds: Math.floor((c % 60000) / 1000)
  };
}

/* ---------------------------------- theme --------------------------------- */

const media = window.matchMedia('(prefers-color-scheme: dark)');
export function applyTheme(theme = 'system') {
  const effective = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
  document.documentElement.dataset.theme = effective;
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = effective === 'dark' ? '#131714' : '#f7f3ea';
}
media.addEventListener('change', () => applyTheme(state.data?.user.theme || 'system'));

/* ---------------------------------- toast --------------------------------- */

export function toast(message, kind = '') {
  const layer = host('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="grow">${esc(message)}</span>`;
  layer.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------------------------------- modal --------------------------------- */

let modalCleanup = null;

export function openModal({ title, subtitle = '', body, wide = false, footer = '', onMount }) {
  closeModal();
  const layer = host('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head">
        <div>
          <h2>${esc(title)}</h2>
          ${subtitle ? `<div class="card-note">${esc(subtitle)}</div>` : ''}
        </div>
        <button class="icon-btn" data-close type="button" aria-label="Close dialog">${icon('close')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  layer.appendChild(backdrop);
  document.body.style.overflow = 'hidden';

  const onKey = (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') {
      const focusables = $$('button, input, select, textarea, a[href]', backdrop).filter(
        (el) => !el.disabled && el.offsetParent !== null
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', onKey);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeModal();
  });
  modalCleanup = () => document.removeEventListener('keydown', onKey);
  if (onMount) onMount(backdrop);
  setTimeout(() => $('input:not([type=hidden]), select, textarea, button[type="submit"]', backdrop)?.focus(), 30);
}

export function closeModal() {
  const layer = document.getElementById('modal-root');
  if (!layer) return;
  layer.innerHTML = '';
  document.body.style.overflow = '';
  if (modalCleanup) modalCleanup();
  modalCleanup = null;
}

/* ---------------------------------- layout -------------------------------- */

export function topbar(title, subtitle, actions = '') {
  return `
    <header class="topbar">
      <div>
        <div class="eyebrow">${esc(subtitle)}</div>
        <h1>${esc(title)}</h1>
      </div>
      <span class="spacer"></span>
      <div class="topbar-actions">${actions}</div>
    </header>`;
}

/* -------------------------------- submitting ------------------------------- */

export function submitting(button, label) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = label;
  return () => {
    button.disabled = false;
    button.innerHTML = original;
  };
}

export function errorText(err) {
  return err?.message || 'Something went wrong.';
}
