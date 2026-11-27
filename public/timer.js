/* ============================================================
   Focus timer: persists across navigation, logs completed blocks
   ============================================================ */

import { $, $$, state, refresh, toast, api } from './lib.js';
import { pushWidgets } from './widgets.js';

const PRESETS = [
  { minutes: 25, label: '25' },
  { minutes: 50, label: '50' },
  { minutes: 90, label: '90' }
];

const BREAK_MINUTES = 5;

let timer = load();
let interval = null;
let saving = false;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem('dse_focus_timer') || 'null');
    if (!raw || typeof raw !== 'object') return null;
    if (!raw.endsAt || !raw.duration) return null;
    return raw;
  } catch {
    return null;
  }
}

function persist() {
  if (timer) localStorage.setItem('dse_focus_timer', JSON.stringify(timer));
  else localStorage.removeItem('dse_focus_timer');
}

export function getTimer() {
  return timer;
}

export function timerState() {
  if (!timer) {
    const duration = (state.timerPresetMinutes || 25) * 60;
    return { running: false, remaining: duration, duration, mode: 'focus', phase: 'idle', progress: 0 };
  }
  const remaining = Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
  const duration = timer.duration;
  return {
    running: true,
    remaining,
    duration,
    mode: timer.mode,
    subjectId: timer.subjectId,
    label: timer.label,
    phase: remaining === 0 ? 'done' : 'running',
    progress: Math.min(1, Math.max(0, 1 - remaining / duration))
  };
}

export function startTimer({ minutes, mode = 'focus', subjectId = null, label = '' }) {
  const duration = Math.round(minutes * 60);
  timer = {
    endsAt: Date.now() + duration * 1000,
    duration,
    mode,
    subjectId,
    label,
    startedAt: new Date().toISOString()
  };
  persist();
  ensureTicker();
  paintTimer();
  pushWidgets();
  toast(mode === 'break' ? `Break started — ${minutes} minutes.` : `Focus block started — ${minutes} minutes.`);
}

export function pauseTimer() {
  if (!timer) return;
  const remaining = Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
  timer.pausedRemaining = remaining;
  timer.endsAt = Date.now() + remaining * 1000;
  timer.pausedAt = Date.now();
  timer.paused = true;
  persist();
  paintTimer();
  pushWidgets();
  toast('Timer paused. The clock is frozen, not reset.');
}

export function resumeTimer() {
  if (!timer?.paused) return;
  const remaining = Math.max(0, timer.pausedRemaining ?? 0);
  timer.endsAt = Date.now() + remaining * 1000;
  timer.paused = false;
  delete timer.pausedAt;
  persist();
  ensureTicker();
  paintTimer();
}

export function stopTimer({ silent = false } = {}) {
  timer = null;
  persist();
  paintTimer();
  pushWidgets();
  if (!silent) toast('Timer cleared without logging.');
}

export function addMinutes(n) {
  if (!timer) return;
  timer.endsAt += n * 60 * 1000;
  timer.duration += n * 60;
  persist();
  paintTimer();
}

/* --------------------------------- painting -------------------------------- */

export function paintTimer() {
  const t = timerState();
  const dials = $$('[data-dial]');
  if (!dials.length) return;

  const mm = String(Math.floor(t.remaining / 60)).padStart(2, '0');
  const ss = String(t.remaining % 60).padStart(2, '0');
  const isBreak = t.mode === 'break';
  const paused = Boolean(timer?.paused);

  // Papers run longer than an hour, so the dial switches to h:mm:ss rather
  // than showing a 135-minute countdown as "135:00".
  const hh = Math.floor(t.remaining / 3600);
  const clock = hh
    ? `${hh}:${String(Math.floor((t.remaining % 3600) / 60)).padStart(2, '0')}:${ss}`
    : `${mm}:${ss}`;

  $$('[data-timer-time]').forEach((el) => (el.textContent = clock));
  $$('[data-timer-phase]').forEach((el) => {
    el.textContent = t.phase === 'idle' ? 'Ready' : paused ? 'Paused' : t.phase === 'done' ? 'Complete' : isBreak ? 'Break' : 'Focus';
  });

  dials.forEach((svg) => {
    const circle = svg.querySelector('.meter');
    if (!circle) return;
    const r = Number(circle.getAttribute('r')) || 92;
    const circumference = 2 * Math.PI * r;
    circle.setAttribute('stroke-dasharray', circumference.toFixed(2));
    circle.setAttribute('stroke-dashoffset', (circumference * (1 - t.progress)).toFixed(2));
    circle.style.stroke = isBreak ? 'var(--gold)' : 'var(--accent)';
  });

  $$('[data-timer-start]').forEach((el) => (el.hidden = Boolean(timer) && !paused));
  $$('[data-timer-pause]').forEach((el) => (el.hidden = !timer || paused));
  $$('[data-timer-resume]').forEach((el) => (el.hidden = !paused));
  $$('[data-timer-stop]').forEach((el) => (el.hidden = !timer));
  $$('[data-timer-finish]').forEach((el) => (el.hidden = !timer || paused));

  $$('[data-preset]').forEach((el) => {
    const active = !timer && Number(el.dataset.preset) === (state.timerPresetMinutes || 25);
    el.setAttribute('aria-pressed', String(active));
  });
  // Paper presets stay visibly unselected once the clock is running.
  $$('[data-timer-subject]').forEach((el) => {
    if (timer?.subjectId) el.value = timer.subjectId;
  });
}

function ensureTicker() {
  if (interval) return;
  interval = setInterval(async () => {
    const t = timerState();
    paintTimer();
    if (timer && !timer.paused && t.remaining <= 0 && !saving) {
      saving = true;
      await completeTimer();
      saving = false;
    }
  }, 500);
}

async function completeTimer() {
  if (!timer) return;
  const finished = { ...timer };
  timer = null;
  persist();
  paintTimer();

  const minutes = Math.round(finished.duration / 60);
  if (finished.mode === 'break') {
    toast('Break over. Back to it.');
    return;
  }

  try {
    const data = await api('/logs', {
      method: 'POST',
      body: {
        subjectId: finished.subjectId || null,
        minutes,
        mode: 'focus',
        label: finished.label || '',
        completedAt: new Date().toISOString()
      }
    });
    await refresh(data);
    toast(`${minutes} minutes logged. Nice block.`);
  } catch (err) {
    toast(`Could not save that block: ${err.message}`, 'error');
  }
}

export { PRESETS, BREAK_MINUTES };
void $;
void state;
