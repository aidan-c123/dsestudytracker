/* ============================================================
   Settings: exam dates, goal, theme, subjects, account
   ============================================================ */

import {
  esc, icon, state, topbar, fmtDate, initials, lvlLabel, usesAttainment, attainmentLabel
} from '../lib.js';

export function renderSettings() {
  const u = state.data.user;
  // Inside the Android app there is nothing to install, so the card is skipped
  // rather than shown with a button that cannot work.
  const nativeApp = document.documentElement.dataset.nativeApp === 'android';
  const theme = u.theme || 'system';
  const installed =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const canPrompt = typeof window !== 'undefined' && Boolean(window.__installPrompt);
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

  return `
    ${topbar('Settings', 'Account & exam plan')}

    <div class="grid cols-2">
      <section class="card">
        <div class="card-head"><h2>Your exam plan</h2></div>
        <form id="exam-form" class="form-grid">
          <div class="field">
            <label for="set-name">Display name</label>
            <input id="set-name" name="name" value="${esc(u.name)}" maxlength="60" autocomplete="name" />
          </div>
          <div class="form-grid two">
            <div class="field">
              <label for="set-exam">First written paper</label>
              <input id="set-exam" name="examDate" type="date" value="${esc(u.examDate)}" />
            </div>
            <div class="field">
              <label for="set-results">Results release</label>
              <input id="set-results" name="resultsDate" type="date" value="${esc(u.resultsDate)}" />
            </div>
          </div>
          <div class="field">
            <label for="set-goal">Daily focus goal (minutes)</label>
            <input id="set-goal" name="dailyGoalMinutes" type="number" min="10" max="720" step="5" value="${u.dailyGoalMinutes}" />
            <span class="hint">Applies to today's ring, the streak and the 14-day bars.</span>
          </div>
          <div class="form-grid two">
            <button class="btn btn-primary" type="submit">Save plan</button>
            <span class="card-note" style="align-self:center">Results ${fmtDate(u.resultsDate, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
          <div class="auth-error" id="exam-error" role="alert" hidden></div>
        </form>
      </section>

      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>Appearance</h2></div>
          <p class="card-note" style="margin:-6px 0 12px">Dark mode follows your device unless you pin it.</p>
          <div class="filter-row" role="group" aria-label="Theme">
            ${['system', 'light', 'dark']
              .map(
                (t) => `<button class="filter-pill" data-act="theme" data-theme="${t}" aria-pressed="${theme === t}">
                  ${t[0].toUpperCase() + t.slice(1)}
                </button>`
              )
              .join('')}
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Subjects</h2><span class="spacer"></span>
            <button class="btn btn-ghost btn-sm" data-act="add-subject">${icon('plus')} Add</button>
          </div>
          <div>
            ${state.data.subjects
              .map(
                (s) => `<div class="session-item">
                  <span class="session-dot"></span>
                  <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                    ${esc(s.name)} <span class="muted">· ${esc(s.code || s.category)}</span>
                  </span>
                  <span class="when">${
                    usesAttainment(s)
                      ? s.attainment
                        ? attainmentLabel(s.attainment)
                        : 'attainment'
                      : `target ${lvlLabel(s.targetLevel)}`
                  }</span>
                  <button class="icon-btn" data-act="edit-subject" data-id="${s.id}" aria-label="Edit ${esc(s.name)}">${icon('edit')}</button>
                </div>`
              )
              .join('')}
          </div>
          <p class="card-note" style="margin-top:10px">Deleting a subject also removes its papers, sessions and tasks — it asks first.</p>
        </section>
      </div>
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <section class="card">
        <div class="card-head"><h2>Change password</h2></div>
        <form id="password-form" class="form-grid">
          <div class="field">
            <label for="pw-current">Current password</label>
            <input id="pw-current" name="currentPassword" type="password" autocomplete="current-password" required />
          </div>
          <div class="field">
            <label for="pw-new">New password</label>
            <input id="pw-new" name="newPassword" type="password" autocomplete="new-password" minlength="8" required />
            <span class="hint">At least 8 characters. Other devices will be signed out.</span>
          </div>
          <div class="auth-error" id="password-error" role="alert" hidden></div>
          <button class="btn btn-primary" type="submit">Update password</button>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><h2>Account</h2><span class="spacer"></span>
          <span class="avatar">${esc(initials(u.name))}</span>
        </div>
        <div class="table-wrap">
          <table class="plain">
            <tbody>
              <tr><td class="muted">Email</td><td>${esc(u.email)}</td></tr>
              <tr><td class="muted">Joined</td><td>${fmtDate(u.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}</td></tr>
              <tr><td class="muted">Subjects</td><td>${state.data.subjects.length}</td></tr>
              <tr><td class="muted">Paper attempts</td><td>${state.data.papers.length}</td></tr>
              <tr><td class="muted">Focus sessions</td><td>${state.data.logs.length}</td></tr>
              <tr><td class="muted">Tasks</td><td>${state.data.tasks.length}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="row" style="margin-top:16px">
          <button class="btn btn-quiet" data-act="signout">Sign out</button>
          <span class="spacer" style="flex:1"></span>
          <button class="btn btn-danger" data-act="delete-account">Delete account</button>
        </div>
        <p class="card-note" style="margin-top:10px">
          Deleting removes your account and every record attached to it. This cannot be undone.
        </p>
      </section>
    </div>

    <section class="card" style="margin-top:16px" id="install-card"${nativeApp ? ' hidden' : ''}>
      <div class="card-head"><h2>Install on your phone</h2></div>
      <p class="card-note" style="margin:-6px 0 12px">
        StarShooter installs to your home screen and opens full-screen, like a normal app.
        Your data stays in the same account either way.
      </p>
      <div id="install-slot">
        ${
          installed
            ? `<p class="card-note">You are already using the installed app.</p>`
            : canPrompt
              ? `<button class="btn btn-primary" data-act="install-app">${icon('plus')} Add StarShooter to my home screen</button>`
              : isIOS
                ? `<p class="card-note">In Safari, tap <b>Share</b> then <b>Add to Home Screen</b>. It opens full-screen from then on.</p>`
                : `<p class="card-note">In Chrome, open the <b>⋮</b> menu and choose <b>Install app</b>.</p>`
        }
      </div>
    </section>

    <section class="card" style="margin-top:16px">
      <div class="card-head"><h2>Export</h2></div>
      <p class="card-note" style="margin:-6px 0 12px">Your data is yours. Download a JSON snapshot for backup or for moving schools.</p>
      <button class="btn btn-quiet" data-act="export-data">${icon('book')} Download my data (.json)</button>
    </section>
  `;
}
