'use strict';

/**
 * Mini Calendar Assistant — Chat-only popup
 * - Chat UI for natural-language scheduling; creates events via background.js
 * - Local list/composer removed for streamlined ChatGPT-like experience
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

// No local storage list, composer, or login UI. OAuth will occur implicitly from background on API call.

// --- Simple LLM parsing stub and chat flow ---
/**
 * Overview
 * - The popup provides a chat box where users type scheduling requests.
 * - We parse the text locally (for now) to extract a start time, and a simple title.
 * - Then we message the background to create the Calendar event with the user's OAuth token.
 *
 * Moving forward
 * - Replace parseNaturalLanguageToEvent with a real LLM call (send the text to your model,
 *   return structured fields: title, startISO, endISO, attendees[], description, etc.).
 * - Add a small dialog/turn-taking logic to ask clarifying questions (e.g., title, attendees).
 * - Maintain conversation state in chrome.storage.local so follow-up messages can reference context.
 */
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

// ---- Minimal local storage for test-mode events ----
const LOCAL_EVENTS_KEY = 'miniCal.localEvents';
function loadLocalEvents() {
  return new Promise(resolve => {
    chrome.storage.local.get([LOCAL_EVENTS_KEY], res => resolve(res[LOCAL_EVENTS_KEY] || []));
  });
}
function saveLocalEvents(events) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [LOCAL_EVENTS_KEY]: events }, resolve);
  });
}

function appendChat(role, content) {
  // Render ChatGPT-like bubbles
  const log = byId('chatLog');
  const row = document.createElement('div');
  row.className = `msg ${role.toLowerCase() === 'you' ? 'user' : 'assistant'}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = content;
  row.appendChild(bubble);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function setBusy(disabled) {
  byId('chatSend').disabled = disabled;
  byId('chatInput').disabled = disabled;
}

function setTyping(visible) {
  const t = byId('typing');
  if (!t) return;
  t.classList.toggle('hidden', !visible);
}

byId('chatSend').addEventListener('click', async () => {
  // 1) Read user message  2) Parse it  3) Ask for title if missing
  // 4) In test-mode, collect missing fields and save locally  5) Show result
  const inputEl = byId('chatInput');
  const text = inputEl.value.trim();
  if (!text) return;

  appendChat('You', text);
  setBusy(true);
  setTyping(true);
  try {
    await handleChatTurn(text);
  } finally {
    setBusy(false);
    setTyping(false);
    inputEl.value = '';
  }
});

// Enter to send, Shift+Enter for newline
byId('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    byId('chatSend').click();
  }
});

// Fetch and display locally saved test events instead of Calendar API (concept test)
byId('showEvents').addEventListener('click', async () => {
  // Toggle/open upcoming panel and render local events
  const panel = byId('upcomingPanel');
  panel.classList.remove('hidden');
  await renderUpcomingList();
});

byId('closeUpcoming').addEventListener('click', () => {
  const panel = byId('upcomingPanel');
  panel.classList.add('hidden');
});

async function renderUpcomingList() {
  const list = byId('upcomingList');
  list.innerHTML = '';
  const events = await loadLocalEvents();
  if (!events.length) {
    const li = document.createElement('li');
    li.className = 'item';
    li.textContent = 'No locally saved test events yet.';
    list.appendChild(li);
    return;
  }
  const sorted = [...events].sort((a,b) => {
    const ta = a.start ? new Date(a.start).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.start ? new Date(b.start).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    const li = document.createElement('li');
    li.className = 'item';
    const timeDiv = document.createElement('div');
    timeDiv.className = 'item-time';
    timeDiv.textContent = ev.start ? fmtDate(ev.start) : '—';
    const bodyDiv = document.createElement('div');
    const titleDiv = document.createElement('div');
    titleDiv.className = 'item-title';
    titleDiv.textContent = ev.title || 'Untitled';
    bodyDiv.appendChild(titleDiv);
    li.appendChild(timeDiv);
    li.appendChild(bodyDiv);
    list.appendChild(li);
  }
}

// ---- Conversational state machine (local-only test) ----
let convo = null; // { step: string, draft: {title,startISO,endISO,attendees[]} }
function resetConvo() { convo = null; }

function startConvoFromText(text) {
  const parsed = parseNaturalLanguageToEvent(text);
  if (parsed.error) { appendChat('Assistant', parsed.error); return null; }
  const draft = { title: parsed.title, startISO: parsed.startISO, endISO: parsed.endISO, attendees: [] };
  if (!draft.title || draft.title === 'New event') return { step: 'askTitle', draft };
  if (!draft.startISO) return { step: 'askWhen', draft };
  return { step: 'askAttendees', draft };
}

function parseEmails(text) {
  const emails = (text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(s => s.toLowerCase());
  return Array.from(new Set(emails));
}

async function handleChatTurn(text) {
  if (convo) {
    const step = convo.step;
    const d = convo.draft;
    if (step === 'askTitle') {
      d.title = text.trim() || d.title || 'Untitled';
      convo.step = d.startISO ? 'askAttendees' : 'askWhen';
      if (convo.step === 'askWhen') appendChat('Assistant', 'When is it? (e.g., “tomorrow 4pm”)');
      else appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)');
      return;
    }
    if (step === 'askWhen') {
      const r = parseNaturalLanguageToEvent(text);
      if (!r.startISO) { appendChat('Assistant', 'I could not parse a time. Try “tomorrow 4pm”.'); return; }
      d.startISO = r.startISO; d.endISO = r.endISO;
      convo.step = 'askAttendees';
      appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)');
      return;
    }
    if (step === 'askAttendees') {
      const emails = /^(no|none|skip)$/i.test(text.trim()) ? [] : parseEmails(text);
      d.attendees = emails;
      convo.step = 'askConfirm';
      const when = `${fmtDate(d.startISO)} → ${new Date(d.endISO).toLocaleTimeString([], { timeStyle: 'short' })}`;
      appendChat('Assistant', `Confirm event:\nTitle: ${d.title}\nWhen: ${when}\nAttendees: ${emails.length ? emails.join(', ') : '—'}\nType "confirm" to save or "edit" to change.`);
      return;
    }
    if (step === 'askConfirm') {
      const t = text.trim().toLowerCase();
      if (t === 'confirm' || t === 'yes' || t === 'y') {
        const events = await loadLocalEvents();
        events.push({ title: d.title, start: d.startISO, end: d.endISO, attendees: d.attendees, createdAt: Date.now() });
        await saveLocalEvents(events);
        const when = `${fmtDate(d.startISO)} → ${new Date(d.endISO).toLocaleTimeString([], { timeStyle: 'short' })}`;
        appendChat('Assistant', `Saved locally: "${d.title}" at ${when}. (Concept test)`);
        resetConvo();
        return;
      }
      if (t === 'edit' || t === 'change') { convo.step = 'askWhatEdit'; appendChat('Assistant', 'What would you like to change? (say: title / time / attendees)'); return; }
      appendChat('Assistant', 'Please type "confirm" to save or "edit" to change.');
      return;
    }
    if (step === 'askWhatEdit') {
      const k = text.trim().toLowerCase();
      if (k.includes('title')) { convo.step = 'askTitle'; appendChat('Assistant', 'What is the new title?'); return; }
      if (k.includes('time') || k.includes('when')) { convo.step = 'askWhen'; appendChat('Assistant', 'What is the new time? (e.g., “tomorrow 4pm”)'); return; }
      if (k.includes('invite') || k.includes('attendee')) { convo.step = 'askAttendees'; appendChat('Assistant', 'Paste emails to invite, or say “no”.'); return; }
      appendChat('Assistant', 'Please say: title / time / attendees.');
      return;
    }
  }

  // New conversation: seed from initial text
  convo = startConvoFromText(text);
  if (!convo) return;
  if (convo.step === 'askTitle') { appendChat('Assistant', 'What should the title be?'); return; }
  if (convo.step === 'askWhen') { appendChat('Assistant', 'When is it? (e.g., “tomorrow 4pm”)'); return; }
  if (convo.step === 'askAttendees') { appendChat('Assistant', 'Anyone to invite? (paste emails or say “no”)'); return; }
}