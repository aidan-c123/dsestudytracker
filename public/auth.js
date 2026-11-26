/* ============================================================
   Auth: sign in, create account, recovery-code reset
   ============================================================ */

import { $, esc, icon, api, state, hooks, applyTheme, openModal, toast, submitting, errorText } from './lib.js';

const root = document.getElementById('root');
let tab = 'login';
let notice = '';

export function renderAuth(message = notice) {
  notice = message || '';
  applyTheme('system');
  const host = document.getElementById('modal-root');
  if (host) host.innerHTML = '';

  root.className = 'auth-wrap';
  root.innerHTML = `
    <div class="auth">
      <aside class="auth-art">
        <div class="brand">
          <div class="brand-mark">4</div>
          <div>
            <div class="brand-name">Desk No. 4</div>
            <div class="brand-sub">HKDSE study desk</div>
          </div>
        </div>
        <h1>Four years, on one honest page.</h1>        <p>For DSE candidates tired of six spreadsheets. Papers, focus blocks, SBA deadlines and the countdown — in one place, private to you.</p>
        <ul>
          <li>Fifteen years of papers, split by paper</li>
          <li>A focus timer that logs itself</li>
          <li>Target vs. predicted, no flattery</li>
          <li>Countdown to 6 April 2027</li>
        </ul>
      </aside>
      <section class="auth-form">
        <div class="auth-tabs" role="tablist" aria-label="Account">
          <button class="auth-tab" role="tab" aria-selected="${tab === 'login'}" data-auth-tab="login">Sign in</button>
          <button class="auth-tab" role="tab" aria-selected="${tab === 'register'}" data-auth-tab="register">Create account</button>
          <button class="auth-tab" role="tab" aria-selected="${tab === 'recover'}" data-auth-tab="recover">Recover</button>
        </div>
        <div id="auth-body"></div>
        <p class="auth-hint" style="margin-top:18px">
          Your records belong to your account only. No ads, no sharing, no class leaderboard.
        </p>
      </section>
    </div>`;

  document.querySelectorAll('[data-auth-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab = btn.dataset.authTab;
      renderAuth('');
    });
  });
  renderBody();
}

function alertBox() {
  if (!notice) return '';
  return `<div class="auth-alert">${esc(notice)}</div>`;
}

function renderBody() {
  const body = $('#auth-body');
  if (!body) return;

  if (tab === 'login') {
    body.innerHTML = `
      ${alertBox()}
      <form id="login-form" class="form-grid" novalidate>
        <div class="field">
          <label for="login-email">Email</label>
          <input id="login-email" name="email" type="email" autocomplete="email" placeholder="you@school.edu.hk" required />
        </div>
        <div class="field">
          <label for="login-password">Password</label>
          <input id="login-password" name="password" type="password" autocomplete="current-password" required />
        </div>
        <div class="auth-error" id="auth-error" role="alert" hidden></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Open my desk</button>
      </form>
      <p class="auth-hint" style="margin-top:14px">
        Forgotten your password? The <b>Recover</b> tab needs your 12-character recovery code — it was shown once at sign-up.
      </p>`;

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type="submit"]', e.currentTarget);
      const restore = submitting(btn, 'Signing in…');
      hideError();
      try {
        await api('/auth/login', {
          method: 'POST',
          body: { email: $('#login-email').value, password: $('#login-password').value }
        });
        await enterApp();
      } catch (err) {
        restore();
        showError(errorText(err));
      }
    });
    return;
  }

  if (tab === 'register') {
    body.innerHTML = `
      ${alertBox()}
      <form id="register-form" class="form-grid" novalidate>
        <div class="field">
          <label for="reg-name">What should we call you?</label>
          <input id="reg-name" name="name" autocomplete="name" maxlength="60" placeholder="Ka Ming" required />
        </div>
        <div class="field">
          <label for="reg-email">Email</label>
          <input id="reg-email" name="email" type="email" autocomplete="email" placeholder="you@school.edu.hk" required />
        </div>
        <div class="field">
          <label for="reg-password">Password</label>
          <input id="reg-password" name="password" type="password" autocomplete="new-password" minlength="8" required />
          <span class="hint">At least 8 characters. Works on phone, iPad and laptop.</span>
        </div>
        <div class="auth-error" id="auth-error" role="alert" hidden></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Create my desk</button>
      </form>
      <p class="auth-hint" style="margin-top:14px">
        Chinese, English, Mathematics and CSD are added automatically. Add electives, M1 or M2 straight after.
      </p>`;

    $('#register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('button[type="submit"]', e.currentTarget);
      const restore = submitting(btn, 'Creating your desk…');
      hideError();
      try {
        const result = await api('/auth/register', {
          method: 'POST',
          body: {
            name: $('#reg-name').value,
            email: $('#reg-email').value,
            password: $('#reg-password').value
          }
        });
        await enterApp();
        showRecoveryCode(result.recoveryCode, true);
      } catch (err) {
        restore();
        showError(errorText(err));
      }
    });
    return;
  }

  body.innerHTML = `
    ${alertBox()}
    <form id="recover-form" class="form-grid" novalidate>
      <div class="field">
        <label for="rec-email">Email</label>
        <input id="rec-email" name="email" type="email" autocomplete="email" placeholder="you@school.edu.hk" required />
      </div>
      <div class="field">
        <label for="rec-code">Recovery code</label>
        <input id="rec-code" name="recoveryCode" placeholder="K7QF-2M9X-RT4B" autocapitalize="characters" spellcheck="false" required />
        <span class="hint">Shown once when you created your account.</span>
      </div>
      <div class="field">
        <label for="rec-password">New password</label>
        <input id="rec-password" name="password" type="password" autocomplete="new-password" minlength="8" required />
      </div>
      <div class="auth-error" id="auth-error" role="alert" hidden></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Reset password</button>
    </form>`;

  $('#recover-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type="submit"]', e.currentTarget);
    const restore = submitting(btn, 'Checking code…');
    hideError();
    try {
      const result = await api('/auth/recover', {
        method: 'POST',
        body: {
          email: $('#rec-email').value,
          recoveryCode: $('#rec-code').value,
          password: $('#rec-password').value
        }
      });
      await enterApp();
      showRecoveryCode(result.recoveryCode, false);
    } catch (err) {
      restore();
      showError(errorText(err));
    }
  });
}

function showError(message) {
  const el = $('#auth-error');
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
}
function hideError() {
  const el = $('#auth-error');
  if (el) el.hidden = true;
}

async function enterApp() {
  state.data = await api('/me');
  state.paperSubjectId = state.data.subjects[0]?.id || null;
  history.replaceState(null, '', window.location.hash || '#/desk');
  hooks.renderApp();
}

export function showRecoveryCode(code, firstTime) {
  openModal({
    title: firstTime ? 'Your desk is ready' : 'Password reset',
    subtitle: 'Save this now. It is the only way back in without your password.',
    body: `
      <p style="font-size:.86rem;color:var(--ink-soft)">
        This is your recovery code. Put it in your password manager, or write it inside your planner.
        It will not be shown again.
      </p>
      <div class="recovery-code">${esc(code)}</div>
      <div class="row" style="gap:8px">
        <button class="btn btn-quiet btn-sm" data-copy="${esc(code)}" type="button">Copy code</button>
        <a class="btn btn-quiet btn-sm" href="data:text/plain;charset=utf-8,${encodeURIComponent(
          `Desk No. 4 recovery code\n${code}\nKeep this private.\n`
        )}" download="dse-recovery-code.txt">Download .txt</a>
      </div>`,
    footer: `<button class="btn btn-primary" data-close type="button">I've saved it</button>`
  });

  const modal = document.querySelector('#modal-root .modal');
  modal?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      toast('Recovery code copied.');
    } catch {
      toast('Copy blocked by the browser — select the code and copy it manually.', 'error');
    }
  });
}

export async function signOut() {
  try {
    await api('/auth/logout', { method: 'POST', body: {} });
  } catch {
    /* cookie may already be gone */
  }
  state.data = null;
  tab = 'login';
  history.replaceState(null, '', '#/');
  renderAuth('');
  toast('Signed out.');
}

export function setAuthTab(next) {
  tab = next;
}
