/* ============================================================
   App shell, routing, countdown ticker
   ============================================================ */

import {
  $, $$, esc, icon, state, hooks, applyTheme, api, toast, initials, countdownParts
} from './lib.js';
import { renderAuth, signOut } from './auth.js';
import { renderDesk } from './views/desk.js';
import { renderPapers } from './views/papers.js';
import { renderFocus } from './views/focus.js';
import { renderTasks } from './views/tasks.js';
import { renderSettings } from './views/settings.js';
import { bindActions, bindViewExtras } from './actions.js';
import { paintTimer } from './timer.js';

const root = document.getElementById('root');

export const NAV = [
  { id: 'desk', label: 'Desk', short: 'Desk', icon: 'desk' },
  { id: 'papers', label: 'Papers', short: 'Papers', icon: 'papers' },
  { id: 'focus', label: 'Focus', short: 'Focus', icon: 'focus' },
  { id: 'tasks', label: 'SBA & tasks', short: 'Tasks', icon: 'tasks' },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: 'settings' }
];

const VIEWS = {
  desk: renderDesk,
  papers: renderPapers,
  focus: renderFocus,
  tasks: renderTasks,
  settings: renderSettings
};

function shellHTML() {
  const user = state.data.user;
  return `
    <div class="shell">
      <aside class="rail">
        <div class="brand">
          <div class="brand-mark">4</div>
          <div>
            <div class="brand-name">Desk No. 4</div>
            <div class="brand-sub">HKDSE study desk</div>
          </div>
        </div>
        <nav class="nav" aria-label="Main">
          ${NAV.map(
            (item) => `
            <a class="nav-item" href="#/${item.id}" data-nav="${item.id}">
              ${icon(item.icon)}<span>${item.label}</span>
              <span class="nav-badge" data-badge="${item.id}" hidden></span>
            </a>`
          ).join('')}
        </nav>
        <div class="rail-foot">
          <div class="rail-card">
            <strong>Private by default.</strong><br />Only you can read these records.
          </div>
          <div class="user-chip">
            <div class="avatar">${esc(initials(user.name))}</div>
            <div class="user-meta">
              <div class="user-name">${esc(user.name)}</div>
              <div class="user-mail">${esc(user.email)}</div>
            </div>
            <button class="icon-btn" data-act="signout" title="Sign out" aria-label="Sign out">${icon('logout')}</button>
          </div>
        </div>
      </aside>

      <div style="min-width:0">
        <div class="mobile-head">
          <div class="brand">
            <div class="brand-mark">4</div>
            <div>
              <div class="brand-name">Desk No. 4</div>
              <div class="brand-sub">HKDSE</div>
            </div>
          </div>
          <span style="flex:1"></span>
          <button class="icon-btn" data-act="toggle-theme" aria-label="Toggle dark mode" title="Toggle dark mode">${icon('moon')}</button>
          <div class="avatar" style="width:28px;height:28px;font-size:.72rem">${esc(initials(user.name))}</div>
        </div>
        <main class="main"><div class="main-inner" id="view"></div></main>
      </div>

      <nav class="tabbar" aria-label="Sections">
        ${NAV.map(
          (item) => `
          <a class="tab" href="#/${item.id}" data-nav="${item.id}">
            ${icon(item.icon)}<span>${item.short}</span>
          </a>`
        ).join('')}
      </nav>
    </div>`;
}

function currentViewFromHash() {
  const raw = (window.location.hash || '').replace(/^#\/?/, '');
  const id = raw.split('?')[0] || 'desk';
  return VIEWS[id] ? id : 'desk';
}

export function syncNav() {
  if (!state.data) return;
  $$('[data-nav]').forEach((el) => {
    if (el.dataset.nav === state.view) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  });

  const open = state.data.tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(`${t.dueDate}T00:00:00`);
    return d < new Date(new Date().setHours(0, 0, 0, 0));
  }).length;
  const badge = $('[data-badge="tasks"]');
  if (badge) {
    if (overdue) {
      badge.hidden = false;
      badge.textContent = String(overdue);
      badge.title = `${overdue} overdue`;
    } else if (open.length) {
      badge.hidden = false;
      badge.textContent = String(open.length);
      badge.title = `${open.length} open`;
    } else {
      badge.hidden = true;
    }
  }
}

export function renderView() {
  if (!state.data) return;
  const host = $('#view');
  if (!host) return;
  host.innerHTML = (VIEWS[state.view] || renderDesk)();
  syncNav();
  bindViewExtras(host);
  paintCountdown();
  paintTimer();
}

export function renderApp() {
  if (!state.data) {
    renderAuth('');
    return;
  }
  applyTheme(state.data.user.theme || 'system');
  state.view = currentViewFromHash();
  root.className = '';
  root.innerHTML = shellHTML();
  syncNav();
  renderView();
  startTicker();
  bindShell();
}

function bindShell() {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.dataset.nav);
    });
  });
}

export function navigate(view) {
  if (!VIEWS[view]) view = 'desk';
  state.view = view;
  history.pushState(null, '', `#/${view}`);
  syncNav();
  renderView();
  window.scrollTo({ top: 0 });
}

/* -------------------------------- countdown ------------------------------- */

export function paintCountdown() {
  if (!state.data) return;
  const c = countdownParts();
  $$('[data-count-days]').forEach((el) => (el.textContent = c.past ? '0' : String(c.days)));
  $$('[data-count-h]').forEach((el) => (el.textContent = String(c.hours).padStart(2, '0')));
  $$('[data-count-m]').forEach((el) => (el.textContent = String(c.minutes).padStart(2, '0')));
  $$('[data-count-s]').forEach((el) => (el.textContent = String(c.seconds).padStart(2, '0')));
  $$('[data-count-sub]').forEach((el) => {
    el.textContent = c.past
      ? 'The written papers have begun — steady on.'
      : `${c.days} days and ${c.hours} hours to the first written paper.`;
  });
}

let ticker = null;
export function startTicker() {
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => {
    paintCountdown();
    paintTimer();
  }, 1000);
  paintCountdown();
}

/* ---------------------------------- boot ---------------------------------- */

hooks.renderView = renderView;
hooks.renderApp = renderApp;
hooks.syncNav = syncNav;
hooks.afterAuth = renderApp;

export async function boot() {
  hooks.renderApp = renderApp;
  bindGlobal();
  try {
    const data = await api('/me');
    state.data = data;
    state.paperSubjectId = data.subjects[0]?.id || null;
    renderApp();
  } catch (err) {
    if (err.status === 401) {
      renderAuth('');
    } else {
      renderAuth('Cannot reach the study desk right now. Check your connection and reload.');
    }
  }
}

let globalBound = false;

function bindGlobal() {
  if (globalBound) return;
  globalBound = true;
  window.addEventListener('hashchange', () => {
    if (!state.data) return;
    const next = currentViewFromHash();
    state.view = next;
    syncNav();
    renderView();
  });

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    if (el.dataset.act === 'signout') {
      e.preventDefault();
      await signOut();
      return;
    }
    bindActions(e, el);
  });

  document.addEventListener('keydown', (e) => {
    if (!state.data) return;
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === 'n' || e.key === 'N') {
      if (state.view === 'papers') {
        e.preventDefault();
        document.querySelector('[data-act="log-paper"]')?.click();
      }
    }
    if (e.key === '1' && e.altKey) navigate('desk');
    if (e.key === '2' && e.altKey) navigate('papers');
    if (e.key === '3' && e.altKey) navigate('focus');
    if (e.key === '4' && e.altKey) navigate('tasks');
  });
}

/* expose for actions.js to avoid circular imports of navigate */
export const navigateRef = { fn: navigate };
