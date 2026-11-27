/**
 * Plan gates in the page.
 *
 * The server is the authority: every gated endpoint refuses on its own, so
 * nothing here can *unlock* anything by being edited. This file only decides
 * what to draw — a real feature, or an honest card explaining what the pass
 * adds and why the free desk is still whole.
 *
 * Written that way on purpose. A student who opens DevTools and flips a flag
 * should get a broken view, not paid features.
 */

import { state } from './lib.js';

/** The student's plan, as the server last described it. */
export function plan() {
  return state.data?.plan || { plan: 'free', name: 'Free', features: [], alwaysFree: [] };
}

/**
 * Copy for the locked card, in case the workspace arrives without a plan.
 *
 * The plan normally comes from `/me`. But every mutating route answers with a
 * bare workspace, and an older cached response has no plan at all — and a lock
 * reading "This view" with no explanation is worse than no lock. So the
 * catalogue is mirrored here, locked, purely as text to draw.
 */
const FALLBACK = {
  pacing: {
    id: 'pacing',
    name: 'Revision pacing',
    summary: 'A week-by-week plan built backwards from your first paper and your SBA deadlines.',
    detail:
      'Works out how many weeks are left, how many papers that implies, and what to touch this week — adjusted for the subjects you have logged least.',
    unlocked: false
  },
  diagnostics: {
    id: 'diagnostics',
    name: 'Weak-topic diagnostics',
    summary: 'Which mistake types keep costing you marks, and in which subjects.',
    detail:
      'Groups the red-ink log by kind of error and by subject, so “careless” and “concept gap” stop looking like the same problem. Needs at least a few entries to say anything useful.',
    unlocked: false
  },
  import: {
    id: 'import',
    name: 'Bulk import',
    summary: 'Load a term of school marks from a CSV instead of typing each paper.',
    detail: 'Useful when you already have marks in a spreadsheet from a mock series or a tutorial centre.',
    unlocked: false
  }
};

/** True when the current plan includes a feature. */
export function unlocked(feature) {
  return Boolean(plan().features?.find((f) => f.id === feature)?.unlocked);
}

/** The catalogue entry for a feature, locked or not. */
export function featureMeta(feature) {
  return plan().features?.find((f) => f.id === feature) || FALLBACK[feature] || null;
}

/**
 * The card shown in place of a gated view.
 *
 * Deliberately not a blurred screenshot or a teaser: it says what the feature
 * does, what it would need to say anything useful, and that the rest of the
 * desk is untouched. Selling by withholding the student's own marks would be
 * the fastest way to lose them, so the copy says out loud that nothing was.
 */
export function lockedCard(feature, { icon = 'lock' } = {}) {
  const meta = featureMeta(feature);
  const name = meta?.name || 'This view';
  const summary = meta?.summary || '';
  const detail = meta?.detail || '';

  return `
    <section class="card locked-card">
      <div class="locked-head">
        <span class="locked-mark" aria-hidden="true">${iconSvg(icon)}</span>
        <div>
          <div class="locked-kicker">Exam pass</div>
          <h2>${escText(name)}</h2>
        </div>
      </div>
      ${summary ? `<p class="locked-summary">${escText(summary)}</p>` : ''}
      ${detail ? `<p class="card-note">${escText(detail)}</p>` : ''}
      <ul class="locked-points">
        <li>Everything you have logged stays free — marks, matrix and export are never gated.</li>
        <li>Nothing is hidden behind this card today; it would be built from data you already have.</li>
      </ul>
      <div class="locked-foot">
        <span class="chip chip-ghost">Free plan</span>
        <span class="muted" style="font-size:.8rem">Ask your teacher or wait for the exam pass.</span>
      </div>
    </section>`;
}

/** Minimal local escape, so this module does not import half of lib.js. */
function escText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A plain padlock, drawn rather than an emoji so it matches the icon set. */
function iconSvg(name) {
  if (name === 'lock') {
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>`;
  }
  return '';
}
