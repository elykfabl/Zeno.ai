'use strict';

/**
 * Mini Calendar Assistant — Practice (local-only)
 * - Stores simple event-like objects in chrome.storage.local
 * - Renders a list, supports delete and clear-all
 * NOTE: Timezone handling — dates typed as "YYYY-MM-DDTHH:mm" are treated
 *       as local time by the JS Date parser; we serialize to UTC ISO for storage.
 */

// ---------- DOM Utilities ----------
/** @param {string} id */
function byId(id) { return /** @type {HTMLElement} */(document.getElementById(id)); }
/** @param {string|number|Date} d */
function fmtDate(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
/** simple HTML escape (bugfix: removed stray ';' from char class) */
function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, s => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[s]));
}

// ---------- Storage ----------
const STORAGE_KEY = 'miniCal.events';

/** @returns {Promise<Array>} */
function loadEvents() {
  return new Promise(resolve => {
    chrome.storage.local.get([STORAGE_KEY], res => resolve(res[STORAGE_KEY] || []));
  });
}

/** @param {Array} events */
function saveEvents(events) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY]: events }, resolve);
  });
}

// ---------- Rendering ----------
/** @param {Array<{title:string,start?:string|null,end?:string|null}>} events */
function render(events) {
  const ul = byId('events');
  ul.innerHTML = '';

  if (!events.length) {
    const li = document.createElement('li');
    li.className = 'item';
    const msg = document.createElement('span');
    msg.className = 'item-title';
    msg.textContent = 'No saved items yet.';
    li.appendChild(msg);
    ul.appendChild(li);
    return;
  }

  // Sort: known start times first, then unknown
  const sorted = [...events].sort((a, b) => {
    const ta = a.start ? new Date(a.start).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.start ? new Date(b.start).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });

  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];

    const li = document.createElement('li');
    li.className = 'item';

    const when = (ev.start && ev.end)
      ? `${fmtDate(ev.start)} → ${new Date(ev.end).toLocaleTimeString([], { timeStyle: 'short' })}`
      : (ev.start ? fmtDate(ev.start) : '—');

    const timeDiv = document.createElement('div');
    timeDiv.className = 'item-time';
    timeDiv.textContent = when;

    const bodyDiv = document.createElement('div');
    const titleDiv = document.createElement('div');
    titleDiv.className = 'item-title';
    titleDiv.textContent = ev.title ? ev.title : 'Untitled';
    bodyDiv.appendChild(titleDiv);

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.dataset.action = 'delete';
    delBtn.dataset.index = String(i);
    delBtn.type = 'button';
    delBtn.textContent = 'Delete';
    actions.appendChild(delBtn);

    li.appendChild(timeDiv);
    li.appendChild(bodyDiv);
    li.appendChild(actions);

    ul.appendChild(li);
  }
}

// ---------- Compose / Validation ----------
function buildISO(dateStr, timeStr) {
  if (!dateStr) return { startISO: null, endISO: null };
  const startLocal = new Date(`${dateStr}T${timeStr || '00:00'}`);
  const startISO = isNaN(startLocal.getTime()) ? null : startLocal.toISOString();
  return { startISO, endISO: null };
}

function buildStartEndISO(dateStr, startStr, endStr) {
  if (!dateStr) return { startISO: null, endISO: null };

  const s = new Date(`${dateStr}T${startStr || '00:00'}`);
  const e = endStr ? new Date(`${dateStr}T${endStr}`) : null;

  const startISO = isNaN(s.getTime()) ? null : s.toISOString();
  const endISO   = (e && !isNaN(e.getTime())) ? e.toISOString() : null;

  // If both present, ensure end >= start
  if (startISO && endISO && new Date(endISO) < new Date(startISO)) {
    throw new Error('End time must be after start time.');
  }
  return { startISO, endISO };
}

// ---------- Actions ----------
async function addEvent() {
  /** @type {HTMLInputElement} */ const titleEl = byId('title');
  /** @type {HTMLInputElement} */ const dateEl  = byId('date');
  /** @type {HTMLInputElement} */ const startEl = byId('start');
  /** @type {HTMLInputElement} */ const endEl   = byId('end');

  const title = titleEl.value.trim();
  const date  = dateEl.value;
  const start = startEl.value;
  const end   = endEl.value;

  if (!title) { alert('Please enter a title.'); return; }

  let startISO = null, endISO = null;
  try {
    const r = buildStartEndISO(date, start, end);
    startISO = r.startISO; endISO = r.endISO;
  } catch (err) {
    alert(String(err.message || err));
    return;
  }

  const events = await loadEvents();
  events.push({ title, start: startISO, end: endISO, createdAt: Date.now() });
  await saveEvents(events);
  render(events);

  // Reset
  titleEl.value = '';
  dateEl.value = '';
  startEl.value = '';
  endEl.value = '';

  alert('Saved locally. (API comes next)');
}

async function onClickList(e) {
  const btn = /** @type {HTMLElement|null} */ (e.target.closest('button'));
  if (!btn) return;
  const action = btn.dataset.action;
  const idx = Number(btn.dataset.index);
  if (Number.isNaN(idx)) return;

  if (action === 'delete') {
    const events = await loadEvents();
    if (idx < 0 || idx >= events.length) return; // bounds check
    events.splice(idx, 1);
    await saveEvents(events);
    render(events);
  }
}

async function clearAll() {
  if (!confirm('Clear all saved items?')) return;
  await saveEvents([]);
  render([]);
}

// ---------- Init ----------
(async function init() {
  byId('addBtn').addEventListener('click', addEvent);
  byId('events').addEventListener('click', onClickList);
  byId('clearAll').addEventListener('click', clearAll);
  render(await loadEvents());
})();

// --- Google Sign-In ---
const loginBtn = document.getElementById('loginBtn');
const statusEl = document.getElementById('status');

loginBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'login' }, response => {
    if (!response || !response.success) {
      alert('Login failed. See console for details.');
      return;
    }
    statusEl.textContent = 'Signed in ✅';
    statusEl.style.color = '#22c55e';
    console.log('Access Token:', response.token);
  });
});

// --- Simple LLM parsing stub and chat flow ---
/**
 * parseNaturalLanguageToEvent attempts to extract { title, startISO, endISO }
 * from a natural-language instruction like "Set calendar for 4:00 AM tomorrow".
 * This is a lightweight deterministic stub; later we can swap in a real LLM call.
 */
function parseNaturalLanguageToEvent(input) {
  const text = String(input || '').trim();
  if (!text) return { error: 'Empty message' };

  // Very naive parse: look for time like 4:00 or 4am and words like today/tomorrow
  const timeMatch = text.match(/(\b\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  const isTomorrow = /tomorrow/i.test(text);
  const isToday = /today/i.test(text);

  let date = new Date();
  if (isTomorrow) {
    date.setDate(date.getDate() + 1);
  }
  // If neither today nor tomorrow mentioned, default to today

  let hours = 9; let minutes = 0;
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    minutes = Number(timeMatch[2] || 0);
    const ampm = (timeMatch[3] || '').toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
  }

  date.setHours(hours, minutes, 0, 0);
  const startISO = date.toISOString();

  // Default 30-minute duration if no end provided
  const endDate = new Date(date.getTime() + 30 * 60 * 1000);
  const endISO = endDate.toISOString();

  // Title fallback
  let title = 'New event';
  const titleMatch = text.match(/(?:about|titled|called)\s+([\w\s]+)/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].trim();
  }

  return { title, startISO, endISO };
}

function appendChat(role, content) {
  const log = byId('chatLog');
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `<div class="item-title">${escapeHtml(role)}</div><div style="margin-left:8px;">${escapeHtml(content)}</div>`;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

function setBusy(disabled) {
  byId('chatSend').disabled = disabled;
  byId('chatInput').disabled = disabled;
}

byId('chatSend').addEventListener('click', async () => {
  const inputEl = byId('chatInput');
  const text = inputEl.value.trim();
  if (!text) return;

  appendChat('You', text);
  setBusy(true);
  try {
    const parsed = parseNaturalLanguageToEvent(text);
    if (parsed.error) {
      appendChat('Assistant', parsed.error);
      return;
    }

    // Ask for title if generic
    if (!parsed.title || parsed.title === 'New event') {
      appendChat('Assistant', 'What should the title be?');
      return;
    }

    // Create via background
    await new Promise((resolve) => chrome.runtime.sendMessage({
      action: 'createCalendarEvent',
      payload: parsed
    }, (resp) => {
      if (!resp || !resp.success) {
        appendChat('Assistant', 'Failed to create event. Please sign in and try again.');
        resolve();
        return;
      }
      const when = `${fmtDate(parsed.startISO)} → ${new Date(parsed.endISO).toLocaleTimeString([], { timeStyle: 'short' })}`;
      appendChat('Assistant', `Created event: "${parsed.title}" at ${when}`);
      resolve();
    }));
  } finally {
    setBusy(false);
    inputEl.value = '';
  }
});